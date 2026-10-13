import {deformCatPoint,inverseCatPoint} from './morphology.js';
import {quadrupedContacts,leapPose,bodyTransform,LEG_IDS} from './quadruped.js';
import {needsExtraRearLeg,rearLegTargets} from './hind-leg.js';

// Keep the complete painted silhouette. The away artwork has only the two
// near-side legs: its two off-side legs reuse this same coat's painted limbs,
// drawn behind the intact torso. They never become opaque procedural tubes.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const rigs=new WeakMap(),meshes=new WeakMap(),limbs=new WeakMap();
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
function uv(frame,p){
 const m=frame.sourceMapping||{x:0,y:0,width:1,height:1};
 const q=frame.rigMorph?inverseCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;
 return {x:(q.x-m.x)/m.width,y:(q.y-m.y)/m.height};
}
function local(frame,q,cw,ch){
 const m=frame.sourceMapping||{x:0,y:0,width:1,height:1},p={x:m.x+q[0]*m.width,y:m.y+q[1]*m.height};
 const d=frame.rigMorph?deformCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;
 return {x:(d.x-frame.anchor.x)*cw,y:(d.y-frame.anchor.y)*ch};
}
export function paintedRig(frame,presetId){
 let rig=rigs.get(frame.image);if(rig)return rig;
 const away=frame.index===4,source=frame.rigSource||frame;
 const g=source.image.getContext('2d',{willReadFrequently:true}),{data,width,height}=g.getImageData(0,0,source.image.width,source.image.height);
 let mass=0,sum=0,bottom=0;
 // Measure the actual lowest painted paw in its own source coordinates.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=data[(y*width+x)*4+3];if(a<90)continue;
  const q=uv(source,{x:source.bounds[0]+x/source.cellWidth,y:source.bounds[1]+y/source.cellHeight});
  if(q.y<.9||q.x<(away?.35:.12)||q.x>(away?.9:.65))continue;
  sum+=q.x*a;mass+=a;bottom=Math.max(bottom,q.y);
 }
 const px=mass?sum/mass:away?.65:.34,py=bottom||.97;
 const points=away?[
  [[.28,.43],[.25,.65]],[[.38,.42],[.37,.63]],
  [[px-.075,py-.30],[px,py]],[[px+.015,py-.34],[px+.095,py-.065]],
 ]:[
  [[px+.085,py-.205],[px,py]],[[px-.035,py-.255],[px-.07,py-.13]],
  [[.75,.55],[.74,.73]],[[.67,.52],[.64,.68]],
 ];
 const missingFar=away&&needsExtraRearLeg(presetId);
 if(missingFar)points[1]=[[.20,.42],[.14,.60]];
 if(away){const far=rearLegTargets({x:px,y:py},presetId).far;points[3]=[far.hip,far.paw];}
 // The fourth paw is normally behind the belly in the front portrait. Its
 // independent, shaded copy can briefly emerge during a step, rather than
 // keeping an entire hind leg permanently absent.
 rig={legs:points.map(([hip,paw],i)=>({id:LEG_IDS[i],hip,paw,far:i%2===1,extra:away?missingFar&&i%2===1:i===3,hidden:false}))};
 rigs.set(frame.image,rig);return rig;
}
export function paintedLimbWeight(q,leg){
 if(leg.hidden||leg.extra)return 0;
 const [hx,hy]=leg.hip,[px,py]=leg.paw;
 const u=clamp((q.y-hy)/(py-hy)),center=hx+(px-hx)*u;
 // The paw stays a single painted shape; weight is flat across its width.
 const side=1-smooth((Math.abs(q.x-center)-.037)/.055);
 return smooth((q.y-hy)/(py-hy)*1.15)*side;
}
export function paintedLimbWeights(q,rig){
 const weights=rig.legs.map(leg=>paintedLimbWeight(q,leg)),sum=weights.reduce((a,b)=>a+b,0);
 if(sum>1)for(let i=0;i<weights.length;i++)weights[i]/=sum;
 // A paw is a rigid painted patch. Averaging overlapping leg weights here
 // previously dragged the far forepaw along with the opposite foreleg.
 let owner=-1,nearest=Infinity;
 for(const [i,leg]of rig.legs.entries())if(!leg.hidden&&!leg.extra){const dx=q.x-leg.paw[0],dy=q.y-leg.paw[1],d=dx*dx+dy*dy;if(d<nearest){nearest=d;owner=i}}
 if(owner>=0){const paw=rig.legs[owner].paw,hold=smooth((.085-Math.abs(q.x-paw[0]))/.025)*smooth((.085-Math.abs(q.y-paw[1]))/.025);for(let i=0;i<weights.length;i++)weights[i]=weights[i]*(1-hold)+(i===owner?hold:0);}
 return weights;
}
export function paintedWalkingOffset(q,rig,away,phase,strength,width,free=1){
 if(strength<=0||free<=0)return {x:0,y:0};
 const wave=phase*Math.PI*2,gauss=(x,y,rx,ry)=>Math.exp(-2*(((q.x-x)/rx)**2+((q.y-y)/ry)**2));
 const head=away?gauss(.20,.17,.29,.24):gauss(.26,.61,.32,.27),headQuiet=1-smooth((head-.03)/.20);
 // Keep the attachment points themselves still. The small weight transfer is
 // in the back/chest between those supports, never a bob of the whole sprite.
 const attachment=Math.min(...rig.legs.map(leg=>smooth(Math.hypot(q.x-leg.hip[0],q.y-leg.hip[1])/.06)));
 const shoulder=away?gauss(.35,.40,.20,.19):gauss(.48,.57,.19,.19),pelvis=away?gauss(.58,.66,.22,.21):gauss(.69,.41,.22,.22);
 let x=(Math.sin(wave)*pelvis*.0034-Math.sin(wave+.25)*shoulder*.0016)*headQuiet;
 let y=Math.sin(wave*2+.4)*(pelvis*.0011+shoulder*.00045)*headQuiet;
 // A tiny pivot of the existing tail pixels, with a fixed base and a smooth
 // influence along the tail. No extra tail image, clipping, or frame swap.
 const base=away?{x:.69,y:.57}:{x:.74,y:.34},tip=away?{x:.86,y:.30}:{x:.88,y:.075};
 const ax=tip.x-base.x,ay=tip.y-base.y,len=ax*ax+ay*ay,dx=q.x-base.x,dy=q.y-base.y,along=(dx*ax+dy*ay)/len;
 const across=(dx*ay-dy*ax)/Math.sqrt(len),tail=smooth((along-.04)/.56)*Math.exp(-((across/.22)**2)),angle=Math.sin(wave-.8)*.025;
 x+=((Math.cos(angle)-1)*dx-Math.sin(angle)*dy)*tail;
 y+=(Math.sin(angle)*dx+(Math.cos(angle)-1)*dy)*tail;
 const amount=strength*width*free*attachment;return {x:x*amount,y:y*amount};
}
function farLimbLayers(frame,rig,atlas){
 let layers=limbs.get(frame.image);if(layers)return layers;
 if(typeof document==='undefined')return rig.legs.map(()=>null);
 layers=rig.legs.map((leg,index)=>{
  if(!leg.extra)return null;
  const sourceFrame=index===1?atlas.frames[0]:frame,sourceRig=index===1?paintedRig(sourceFrame,atlas.presetId):rig;
  const near=sourceRig.legs[index===1?0:2],surface=document.createElement('canvas');surface.width=sourceFrame.image.width;surface.height=sourceFrame.image.height;
  const g=surface.getContext('2d',{willReadFrequently:true}),pixels=sourceFrame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,surface.width,surface.height);
  const [hx,hy]=near.hip,[px,py]=near.paw;
  let left=surface.width,top=surface.height,right=0,bottom=0;
  for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
   const q=uv(sourceFrame,{x:sourceFrame.bounds[0]+(x+.5)/sourceFrame.cellWidth,y:sourceFrame.bounds[1]+(y+.5)/sourceFrame.cellHeight});
   const t=clamp((q.y-hy)/(py-hy)),center=hx+(px-hx)*t,half=index===3?.082:.075;
   const mask=clamp((half-Math.abs(q.x-center))/.012)*smooth((q.y-hy+.07)/.045)*clamp((py+.04-q.y)/.015);
   const i=(y*surface.width+x)*4;pixels.data[i+3]*=mask;
   // The far pair stays in the body's soft shade, including custom pigment.
   pixels.data[i]*=.88;pixels.data[i+1]*=.88;pixels.data[i+2]*=.9;
   if(pixels.data[i+3]>2){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  }
  g.putImageData(pixels,0,0);
  if(right<=left||bottom<=top)return null;
  const cropped=document.createElement('canvas');cropped.width=right-left;cropped.height=bottom-top;cropped.getContext('2d').drawImage(surface,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  return {image:cropped,left,top,source:near,frame:sourceFrame};
 });limbs.set(frame.image,layers);return layers;
}
// Retarget the painted limb once to its far-side anatomy, then translate the
// paw as one shape. Only the fur between shoulder and ankle bends. In
// particular, the visible toe and its contact shadow share the SAME endpoint.
export function paintedLimbPoint(point,sourceHip,sourcePaw,restHip,restPaw,hip,paw){
 const sx=sourcePaw.x-sourceHip.x,sy=sourcePaw.y-sourceHip.y,rx=restPaw.x-restHip.x,ry=restPaw.y-restHip.y,length2=sx*sx+sy*sy||1;
 const a=(sx*rx+sy*ry)/length2,b=(sx*ry-sy*rx)/length2,dx=point.x-sourceHip.x,dy=point.y-sourceHip.y;
 const u=(dx*sx+dy*sy)/length2,weight=smooth((u-.08)/.70);
 return {x:restHip.x+a*dx-b*dy+(hip.x-restHip.x)*(1-weight)+(paw.x-restPaw.x)*weight,
  y:restHip.y+b*dx+a*dy+(hip.y-restHip.y)*(1-weight)+(paw.y-restPaw.y)*weight};
}
function drawFarLimbs(ctx,frame,rig,body,feet,cw,ch,atlas,width,triangle){
 for(const [i,layer]of farLimbLayers(frame,rig,atlas).entries()){
  if(!layer)continue;
  const sf=layer.frame,scw=width/atlas.referenceWidth*(sf.scale||1),sch=scw*sf.cellHeight/sf.cellWidth;
  const sourceHip=local(sf,layer.source.hip,scw,sch),sourcePaw=local(sf,layer.source.paw,scw,sch);
  const hip=body.apply(local(frame,rig.legs[i].hip,cw,ch)),paw=feet[i];
  const restHip=local(frame,rig.legs[i].hip,cw,ch),restPaw=local(frame,rig.legs[i].paw,cw,ch),columns=4,rows=12,points=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
   const source={x:x/columns*layer.image.width,y:y/rows*layer.image.height};
   const point={x:(sf.bounds[0]-sf.anchor.x+(layer.left+source.x)/sf.cellWidth)*scw,y:(sf.bounds[1]-sf.anchor.y+(layer.top+source.y)/sf.cellHeight)*sch};
   points.push({source,target:paintedLimbPoint(point,sourceHip,sourcePaw,restHip,restPaw,hip,paw)});
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x;for(const ids of [[a,a+1,a+columns+1],[a+1,a+columns+2,a+columns+1]])triangle(ctx,layer.image,ids.map(i=>points[i].source),ids.map(i=>points[i].target));}
 }
}
function meshFor(frame,rig){
 let mesh=meshes.get(frame.image);if(mesh)return mesh;
 const columns=16,rows=20,vertices=[],b=frame.bounds;
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
  const p={x:b[0]+x/columns*b[2],y:b[1]+y/rows*b[3]},q=uv(frame,p);
  const weights=paintedLimbWeights(q,rig);
  vertices.push({source:{x:x/columns*frame.image.width,y:y/rows*frame.image.height},u:x/columns,v:y/rows,q,weights});
 }
 const {data,width,height}=frame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.image.width,frame.image.height),occupied=new Set();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>1)occupied.add(Math.floor(y/height*rows)*columns+Math.floor(x/width*columns));
 const cells=[];for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(occupied.has(y*columns+x))cells.push([x,y]);
 mesh={columns,vertices,cells};meshes.set(frame.image,mesh);return mesh;
}
function meshPawPoint(mesh,points,anchor,left,top,w,h){
 const rows=20,x=clamp((anchor.x-left)/w)*mesh.columns,y=clamp((anchor.y-top)/h)*rows,col=Math.min(mesh.columns-1,Math.floor(x)),row=Math.min(rows-1,Math.floor(y)),u=x-col,v=y-row,a=row*(mesh.columns+1)+col;
 const ids=u+v<=1?[a,a+1,a+mesh.columns+1]:[a+1,a+mesh.columns+2,a+mesh.columns+1],weights=u+v<=1?[1-u-v,u,v]:[1-v,u+v-1,1-u];
 return ids.reduce((p,id,i)=>({x:p.x+points[id].target.x*weights[i],y:p.y+points[id].target.y*weights[i]}),{x:0,y:0});
}
export function constrainPaintedStep(delta,width,airborne=false){
 const max=width*(airborne?.105:.065),length=Math.hypot(delta.x,delta.y),k=length>max?max/length:1;
 return {x:delta.x*k,y:delta.y*k};
}
export function paintedStride(requested,widthInWorld){return Math.min(requested,Math.max(.001,widthInWorld*.17));}
export function paintedStepTargets(contacts,anchors,body){
 // Do not clip a solved contact afterwards: doing so makes the painted foot
 // slide with the torso although the planner still labels it "planted".
 const deltas=contacts.map((foot,i)=>{const a=body.apply(anchors[i]);return{x:foot.x-a.x,y:foot.y-a.y};});
 return {deltas,feet:contacts};
}
export function drawPaintedGait(ctx,frame,atlas,width,action,time,options,triangle){
 const rig=paintedRig(frame,atlas.presetId),cw=width/atlas.referenceWidth*(frame.scale||1),ch=cw*frame.cellHeight/frame.cellWidth,b=frame.bounds;
 const left=(b[0]-frame.anchor.x)*cw,top=(b[1]-frame.anchor.y)*ch,w=b[2]*cw,h=b[3]*ch;
 const pose=leapPose(options.motionStage,options.stageProgress,options.traverse,width);
 if(!options.motionStage&&options.settle){const settle=clamp(options.settle);pose.drop+=width*.006*settle;pose.sx*=1+.006*settle;pose.sy*=1-.012*settle;}
 if(options.reducedMotion){pose.pitch*=.5;pose.drop*=.5;pose.sx=1+(pose.sx-1)*.5;pose.sy=1+(pose.sy-1)*.5}
 const body=bodyTransform(frame,rig,pose,cw,ch),anchors=rig.legs.map(l=>local(frame,l.paw,cw,ch));
 const planning=options.locomotion?{...options,locomotion:{...options.locomotion,stride:paintedStride(options.locomotion.stride,width/(options.worldScale||1))}}:options;
 const contacts=quadrupedContacts(frame,atlas,width,action,planning,rig);
 const {deltas,feet}=paintedStepTargets(contacts,anchors,body);
 if(action==='idle'&&!options.motionStage&&deltas.every(d=>Math.hypot(d.x,d.y)<.02)){
  const visible=feet.map((foot,i)=>({...foot,visualX:anchors[i].x,visualY:anchors[i].y}));
  options.drawContactShadows?.(ctx,visible);drawFarLimbs(ctx,frame,rig,body,feet,cw,ch,atlas,width,triangle);
  ctx.drawImage(frame.image,left,top,w,h);return {left,top,width:w,height:h,contacts:visible};
 }
 const mesh=meshFor(frame,rig),{columns,vertices,cells}=mesh,points=vertices.map(v=>{
  const target=body.apply({x:left+v.u*w,y:top+v.v*h});
  for(let i=0;i<4;i++){target.x+=deltas[i].x*v.weights[i];target.y+=deltas[i].y*v.weights[i]}
  if(action.startsWith('walk')&&!options.motionStage){
   const strength=(options.strideStrength??1)*(options.reducedMotion?.35:1),offset=paintedWalkingOffset(v.q,rig,frame.index===4,contacts[0]?.phase??options.gaitPhase??0,strength,width,1-v.weights.reduce((a,b)=>a+b,0));
   target.x+=offset.x;target.y+=offset.y;
  }
  return {source:v.source,target};
 });
 const visible=feet.map((foot,i)=>{const p=rig.legs[i].extra?foot:meshPawPoint(mesh,points,anchors[i],left,top,w,h);return {...foot,visualX:p.x,visualY:p.y};});
 options.drawContactShadows?.(ctx,visible);drawFarLimbs(ctx,frame,rig,body,feet,cw,ch,atlas,width,triangle);
 for(const [x,y] of cells){const a=y*(columns+1)+x;for(const ids of [[a,a+1,a+columns+1],[a+1,a+columns+2,a+columns+1]])triangle(ctx,frame.image,ids.map(i=>points[i].source),ids.map(i=>points[i].target))}
 const xs=points.map(p=>p.target.x),ys=points.map(p=>p.target.y),minX=Math.min(...xs),minY=Math.min(...ys);
 return {left:minX,top:minY,width:Math.max(...xs)-minX,height:Math.max(...ys)-minY,contacts:visible};
}
