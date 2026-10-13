// Projection/calibration for the shared courtyard skeletal renderer. These helpers
// never mutate a cat or its persisted two-dimensional navigation coordinates.
const ASPECT=9/16,TAU=Math.PI*2;
const finite=(n,fallback)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const DEFAULT_CAT_3D_CALIBRATION=Object.freeze({
 modelLength:.7,scale:1,cameraElevationDegrees:55,walkStride:.36,groundOffset:0,
 centerX:0,centerZ:0,rotationYDegrees:0,viewSpan:2.4,anchorY:.64,
 rootMotionNodes:[],footBones:{},clipNames:{},clipLoops:{},mouthBone:null,mouthOffset:{x:0,y:0,z:0},mouthMorphOffsets:{},jumpSections:{crouch:.24,jump:.78},
});
export function normalizeCat3DCalibration(raw={}){
 const d=DEFAULT_CAT_3D_CALIBRATION;
 return {...d,
  modelLength:clamp(finite(raw.modelLength,d.modelLength),.05,10),scale:clamp(finite(raw.scale,d.scale),.1,4),
  cameraElevationDegrees:clamp(finite(raw.cameraElevationDegrees,d.cameraElevationDegrees),20,80),
  walkStride:clamp(finite(raw.walkStride,d.walkStride),.01,10),groundOffset:finite(raw.groundOffset,0),
  centerX:finite(raw.centerX,0),centerZ:finite(raw.centerZ,0),rotationYDegrees:finite(raw.rotationYDegrees,0),
  viewSpan:clamp(finite(raw.viewSpan,d.viewSpan),1.5,5),anchorY:clamp(finite(raw.anchorY,d.anchorY),.4,.8),
  rootMotionNodes:Array.isArray(raw.rootMotionNodes)?raw.rootMotionNodes.filter(n=>typeof n==='string'):[],
  footBones:raw.footBones&&typeof raw.footBones==='object'?{...raw.footBones}:{},
  clipNames:raw.clipNames&&typeof raw.clipNames==='object'?{...raw.clipNames}:{},
  clipLoops:raw.clipLoops&&typeof raw.clipLoops==='object'?Object.fromEntries(Object.entries(raw.clipLoops).filter(([,range])=>range&&Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start).map(([name,range])=>[name,{start:range.start,end:range.end}])):{},
  mouthBone:typeof raw.mouthBone==='string'?raw.mouthBone:null,
  mouthOffset:{x:finite(raw.mouthOffset?.x??raw.mouthOffset?.[0],0),y:finite(raw.mouthOffset?.y??raw.mouthOffset?.[1],0),z:finite(raw.mouthOffset?.z??raw.mouthOffset?.[2],0)},
  mouthMorphOffsets:raw.mouthMorphOffsets&&typeof raw.mouthMorphOffsets==='object'?Object.fromEntries(Object.entries(raw.mouthMorphOffsets).map(([name,offset])=>[name,{x:finite(offset?.x??offset?.[0],0),y:finite(offset?.y??offset?.[1],0),z:finite(offset?.z??offset?.[2],0)}])):{},
  jumpSections:{crouch:clamp(finite(raw.jumpSections?.crouch,.24),.05,.4),jump:clamp(finite(raw.jumpSections?.jump,.78),.6,.95)},
  presetId:typeof raw.presetId==='string'?raw.presetId:null,
 };
}
// The skeletal cats have not passed visual acceptance. Keep the original
// painted designs in the normal courtyard, including packaged desktop launches.
export function cat3DPilotEnabled(search=''){return ['pilot','all'].includes(new URLSearchParams(search).get('cat3d'));}
export function groundToCat3D(point,elevation=0,cameraElevationDegrees=55){
 const a=cameraElevationDegrees*Math.PI/180,y=finite(elevation,0),v=finite(point?.y,0)*ASPECT;
 return {x:finite(point?.x,0),y,z:(v+y*Math.cos(a))/Math.sin(a)};
}
export function cat3DToGround(point,cameraElevationDegrees=55){
 const a=cameraElevationDegrees*Math.PI/180;
 return {x:point.x,y:(point.z*Math.sin(a)-point.y*Math.cos(a))/ASPECT};
}
export function cat3DHeading(heading,cameraElevationDegrees=55){
 const a=cameraElevationDegrees*Math.PI/180,h=finite(heading,0);
 // Model faces +Z. Screen heading 0 means right; positive pi/2 means down.
 return Math.atan2(Math.cos(h),Math.sin(h)/Math.sin(a));
}
export function smoothCat3DYaw(previous,target,dt){
 if(!Number.isFinite(previous))return target;
 const delta=Math.atan2(Math.sin(target-previous),Math.cos(target-previous));
 return previous+delta*(1-Math.exp(-Math.max(0,Math.min(.06,finite(dt,0)))*13));
}
export function cat3DGroundDistance(a,b,cameraElevationDegrees=55){
 const angle=cameraElevationDegrees*Math.PI/180;
 return Math.hypot(b.x-a.x,(b.y-a.y)*ASPECT/Math.sin(angle));
}
export function cat3DVisualWidth(cat,preset={}){
 const size=clamp(finite(cat.customization?.size,1),.7,1.35);
 return finite(preset.scale,.068)*(.88+cat.y*.18)*size;
}
export function cat3DAction(cat){
 if(cat.traverse&&cat.traverse.style!=='stride')return cat.traverse.direction==='down'?'HopDown':'HopUp';
 const moving=['walk','approach'].includes(cat.state)&&(cat.speed>.0003||Math.hypot(cat.motionDx||0,cat.motionDy||0)>.000001);
 if(moving)return 'Walk';
 if(cat.state==='sleep')return 'Sleep';
 if(cat.state==='rest')return 'Rest';
 if(['eat','drink'].includes(cat.state))return 'Eat';
 if(cat.state==='groom')return 'Groom';
 if(cat.task?.phase==='interact'){
  if(cat.task.tool==='scratch')return 'Scratch';
  if(cat.task.tool==='pet')return 'Pet';
  if(['yarn','mouse','wand'].includes(cat.task.tool))return 'Play';
 }
 return 'Idle';
}
export function resolveCat3DClip(requestedAction,availableClips,style={}){
 const has=name=>availableClips instanceof Map?availableClips.has(name):availableClips.includes(name);
 const plush=['Sleep','Rest'].includes(requestedAction)&&(style.fluff>.6||style.morphs?.Build>.65),variant=`${requestedAction}Plush`;
 if(plush&&has(variant))return {requestedAction,clip:variant,fallback:false,missingClip:null,jumpReady:true};
 const missing=!has(requestedAction),missingJump=missing&&['HopUp','HopDown'].includes(requestedAction);
 return {requestedAction,clip:missingJump?null:missing?(has('Idle')?'Idle':null):requestedAction,fallback:missing,missingClip:missing?requestedAction:null,jumpReady:!missingJump};
}
export function cat3DClipTime(action,cat,duration,{walkPhase=0,time=0,actionAge=time,calibration=DEFAULT_CAT_3D_CALIBRATION}={}){
 if(!(duration>0))return 0;
 if(action==='Walk')return ((walkPhase%1)+1)%1*duration;
 if(action==='HopUp'||action==='HopDown'){
  const move=cat.traverse;if(!move)return 0;
  const p=clamp(finite(move.progress,0),0,1),sections=calibration.jumpSections;
  const t=move.phase==='crouch'?p*sections.crouch:move.phase==='jump'?sections.crouch+p*(sections.jump-sections.crouch):sections.jump+p*(1-sections.jump);
  // Avoid an exact duration wrapping to the first frame at touchdown.
  return Math.min(duration-1e-6,Math.max(0,t*duration));
 }
 const loop=calibration.clipLoops?.[action];
 if(loop){const age=Math.max(0,finite(actionAge,0)),start=Math.min(duration-1e-6,loop.start),end=Math.min(duration,loop.end);if(age<start)return age;if(end>start)return start+(age-start)%(end-start);}
 return Math.max(0,finite(time,0))%duration;
}
export function sampleCat3DBlend(previous,{action,clipTime,time,duration=.14}){
 const changed=!previous||previous.action!==action;
 // Snapshot the actually displayed layers. In particular, an outgoing Hop
 // must keep its last landing sample after CatGame clears cat.traverse.
 const outgoing=changed?(previous?.layers||[]).map(layer=>({...layer})):previous.outgoing;
 const transitionAt=changed?time:previous.transitionAt;
 const blend=outgoing.length?clamp((time-transitionAt)/Math.max(.001,duration),0,1):1;
 const layers=outgoing.filter(layer=>layer.name!==action&&layer.weight*(1-blend)>1e-7).map(layer=>({...layer,weight:layer.weight*(1-blend)}));
 const same=outgoing.find(layer=>layer.name===action)?.weight||0;
 layers.push({name:action,time:clipTime,weight:same+(1-same)*blend});
 return {action,transitionAt,outgoing:blend<1?outgoing:[],layers};
}
export function cat3DStrideAdvance(distance,visualWorldWidth,calibration=DEFAULT_CAT_3D_CALIBRATION){
 if(!(distance>0)||distance>.15||!(visualWorldWidth>0))return 0;
 return distance/visualWorldWidth*calibration.modelLength/(calibration.walkStride*calibration.scale);
}
export function freezeCat3DRootTrack(track,nodeNames){
 // Only explicitly designated model roots lose translation. Pelvis/spine
 // bone position keys must remain: they contain crouching and weight shift.
 const target=track.name.replace(/\.position$/,''),nodeName=target.match(/\.bones\[([^\]]+)\]$/)?.[1]||target;
 if(!track.name.endsWith('.position')||!nodeNames.includes(nodeName)||track.values.length<3)return track;
 const next=track.clone();for(let i=3;i<next.values.length;i++)next.values[i]=next.values[i%3];return next;
}
export {ASPECT as CAT_3D_ASPECT,TAU as CAT_3D_TAU};
