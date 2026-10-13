import test from 'node:test';
import assert from 'node:assert/strict';
import {paintedLimbWeight,paintedLimbWeights,paintedWalkingOffset,constrainPaintedStep,paintedStride,paintedStepTargets,paintedLimbPoint,drawPaintedGait,paintedRig} from '../src/themes/cats/painted-gait.js';
import {QuadrupedFooting} from '../src/themes/cats/quadruped.js';
import {CAT_PRESETS} from '../src/themes/cats/catalog.js';
test('painted paw deformation pins the hip and preserves a full paw-width influence',()=>{
 const leg={hip:[.4,.7],paw:[.34,.95]};
 assert.equal(paintedLimbWeight({x:.4,y:.69},leg),0);
 assert.equal(paintedLimbWeight({x:.4,y:.7},leg),0);
 assert.equal(paintedLimbWeight({x:.32,y:.95},leg),1);
 assert.equal(paintedLimbWeight({x:.36,y:.95},leg),1);
 assert.equal(paintedLimbWeight({x:.7,y:.95},leg),0);
 assert.equal(paintedLimbWeight({x:.34,y:.95},{...leg,hidden:true}),0);
 for(let y=.65;y<1;y+=.003){const a=paintedLimbWeight({x:.35,y},leg),b=paintedLimbWeight({x:.35,y:y+.003},leg);assert.ok(Math.abs(a-b)<.04)}
});
test('planned short steps keep visible paws fixed through stance and stop without an idle slide',()=>{
 const planner=new QuadrupedFooting(),width=100,scale=1000,anchors=[{x:-22,y:0},{x:-29,y:-13},{x:24,y:-25},{x:14,y:-30}],body={apply:p=>p};
 let previous,x=0,y=0,distance=0,checks=0;
 for(let i=0;i<400;i++){
  const moving=i<330,speed=moving?.00012+.00015*(.5+.5*Math.sin(i/45)):0,angle=1+i*.001;
  x+=Math.cos(angle)*speed;y+=Math.sin(angle)*speed;distance+=speed;
  const contacts=planner.sample({origin:{x,y},direction:{x:Math.cos(angle),y:Math.sin(angle)},distance,stride:paintedStride(.022,width/scale),anchors:anchors.map(p=>({x:p.x/scale,y:p.y/scale})),moving});
  const targets=paintedStepTargets(contacts.map(f=>({...f,x:f.groundX*scale,y:f.groundY*scale-f.lift*width})),anchors,body);
  const visible=targets.feet.map((f,j)=>({...f,x:x*scale+anchors[j].x+targets.deltas[j].x,y:y*scale+anchors[j].y+targets.deltas[j].y}));
  if(previous)for(let j=0;j<4;j++)if(previous[j].planted&&visible[j].planted&&previous[j].cycle===visible[j].cycle){assert.ok(Math.hypot(visible[j].x-previous[j].x,visible[j].y-previous[j].y)<1e-9,'post-planner deformation cannot undo a ground contact');checks++;}
  previous=visible;
 }
 assert.ok(checks>850);
});
test('far painted limb ends exactly at the contact while the paw patch keeps its shape',()=>{
 const sourceHip={x:2,y:4},sourcePaw={x:4,y:31},restHip={x:12,y:8},restPaw={x:14,y:33};
 const a={x:3.2,y:30},b={x:5.2,y:31},mapped=[];
 for(const paw of [{x:11,y:32},{x:17,y:29},{x:16,y:37}]){
  const hip={x:11.8,y:8.2};assert.deepEqual(paintedLimbPoint(sourcePaw,sourceHip,sourcePaw,restHip,restPaw,hip,paw),paw);
  const x=paintedLimbPoint(a,sourceHip,sourcePaw,restHip,restPaw,hip,paw),y=paintedLimbPoint(b,sourceHip,sourcePaw,restHip,restPaw,hip,paw);mapped.push({x:y.x-x.x,y:y.y-x.y});
 }
 for(const value of mapped)assert.ok(Math.hypot(value.x-mapped[0].x,value.y-mapped[0].y)<1e-12,'a planted or lifted paw does not stretch');
});
test('a forepaw is owned by its own leg even where the two mesh influences overlap',()=>{
 const rig={legs:[{hip:[.45,.74],paw:[.365,.98]},{hip:[.33,.72],paw:[.295,.85]},{hip:[.75,.55],paw:[.74,.73]},{hip:[.67,.52],paw:[.64,.68],extra:true}]};
 for(const i of [0,1,2]){const q={x:rig.legs[i].paw[0],y:rig.legs[i].paw[1]},weights=paintedLimbWeights(q,rig);assert.equal(weights[i],1);assert.equal(weights.reduce((sum,n)=>sum+n,0),1);}
});
test('walking breathes through the shoulder, pelvis and tail while the face and joint supports stay still',()=>{
 for(const bank of [0,4]){
  const rig=paintedRig(mockFrame(bank),'ragdoll'),head=bank?{x:.20,y:.17}:{x:.26,y:.61},torso=bank?{x:.56,y:.57}:{x:.63,y:.43},tail=bank?{x:.86,y:.30}:{x:.88,y:.075};
  let torsoMotion=0,tailMotion=0;
  for(let i=0;i<80;i++){
   const phase=i/80,face=paintedWalkingOffset(head,rig,!!bank,phase,1,100);
   assert.ok(Math.hypot(face.x,face.y)<.015,'head stays steady');
   for(const leg of rig.legs){const joint=paintedWalkingOffset({x:leg.hip[0],y:leg.hip[1]},rig,!!bank,phase,1,100);assert.equal(Math.hypot(joint.x,joint.y),0);}
   const back=paintedWalkingOffset(torso,rig,!!bank,phase,1,100),tip=paintedWalkingOffset(tail,rig,!!bank,phase,1,100);
   torsoMotion=Math.max(torsoMotion,Math.hypot(back.x,back.y));tailMotion=Math.max(tailMotion,Math.hypot(tip.x,tip.y));
   assert.ok(Math.hypot(back.x,back.y)<.5,'torso weight transfer stays below half a percent of width');
   assert.deepEqual(paintedWalkingOffset(tail,rig,!!bank,phase,0,100),{x:0,y:0});
  }
  assert.ok(torsoMotion>.08&&tailMotion>.4);
 }
});

function mockFrame(index){
 const width=120,height=120,data=new Uint8ClampedArray(width*height*4);
 for(let y=2;y<116;y++)for(let x=12;x<108;x++)if(y<88||x>=38&&x<=48)data[(y*width+x)*4+3]=255;
 const image={width,height,getContext:()=>({getImageData:()=>({data:data.slice(),width,height})})};
 return {index,image,scale:1,cellWidth:width,cellHeight:height,bounds:[0,0,1,1],sourceMapping:{x:0,y:0,width:1,height:1},anchor:{x:.5,y:1}};
}
test('all coats put a missing away hind limb on the off side, not outside the near rump',()=>{
 for(const preset of CAT_PRESETS){const rig=paintedRig(mockFrame(4),preset.id),near=rig.legs[2],far=rig.legs[3];if(far.extra){assert.ok(far.paw[0]<near.paw[0]-.12,preset.id);assert.ok(far.paw[1]<near.paw[1],preset.id);}assert.equal(rig.legs.filter(leg=>!leg.hidden).length,4);}
});
test('actual triangulated paw samples agree with solver contacts, including mirrored walking and turn settling',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({putImageData(){},drawImage(){}})})};
 try{
  for(const bank of [0,4])for(const flip of [-1,1]){
   const frame=mockFrame(bank),atlas={presetId:'ragdoll',referenceWidth:1,frames:[mockFrame(0)]},key={};let previous,checks=0;
   for(let i=0;i<150;i++){
    const x=.4+i*.00022,options={flip,worldScale:1000,settle:Math.sin(i/150*Math.PI)*.7,locomotion:{key,origin:{x,y:.4},direction:{x:1,y:0},distance:i*.00022,stride:.022,moving:true}};
    const result=drawPaintedGait({drawImage(){}},frame,atlas,100,bank===4?'walkAway':'walkToward',i/60,options,()=>{});
    for(const foot of result.contacts)assert.ok(Math.hypot(foot.visualX-foot.x,foot.visualY-foot.y)<.12,`${bank}/${flip}/${foot.id}: mesh paw must end at its contact`);
    const visible=result.contacts.map(f=>({...f,wx:x*1000+flip*f.visualX,wy:400+f.visualY}));
    if(previous)for(let j=0;j<4;j++)if(previous[j].planted&&visible[j].planted&&previous[j].cycle===visible[j].cycle){assert.ok(Math.hypot(visible[j].wx-previous[j].wx,visible[j].wy-previous[j].wy)<.05,'visible paw, not merely planned paw, remains planted');checks++;}
    previous=visible;
   }
   assert.ok(checks>200);
  }
 }finally{globalThis.document=originalDocument;}
});
test('even a footfall correction or turn cannot pull a painted leg beyond its short stride',()=>{
 for(const width of [40,80,140])for(const x of [-100,0,100])for(const y of [-100,0,100]){
  const step=constrainPaintedStep({x,y},width);assert.ok(Math.hypot(step.x,step.y)<=width*.065+1e-8);
  assert.ok(step.x*x>=0&&step.y*y>=0);
 }
 assert.deepEqual(constrainPaintedStep({x:1,y:-1},100),{x:1,y:-1});
});
