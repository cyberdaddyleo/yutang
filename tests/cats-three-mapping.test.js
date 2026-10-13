import test from 'node:test';
import assert from 'node:assert/strict';
import {cat3DPilotEnabled,normalizeCat3DCalibration,groundToCat3D,cat3DToGround,cat3DHeading,smoothCat3DYaw,cat3DGroundDistance,cat3DVisualWidth,cat3DStrideAdvance,cat3DClipTime,cat3DAction,resolveCat3DClip,freezeCat3DRootTrack} from '../src/themes/cats/three-cat-mapping.js';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('normal courtyard keeps painted cats; unapproved 3D needs an explicit preview link',()=>{
 for(const query of ['', '?other=x', '?cat3d=', '?cat3d=legacy', '?cat3d=false', '?cat3d=unknown'])assert.equal(cat3DPilotEnabled(query),false,query);
 assert.equal(cat3DPilotEnabled('?cat3d=all'),true);
 assert.equal(cat3DPilotEnabled('?cat3d=pilot'),true);assert.equal(cat3DPilotEnabled('?other=x&cat3d=pilot'),true);
});
test('support height inversely projects to the identical saved feet, with no double vertical lift',()=>{
 for(const angle of [35,55,70])for(const height of [0,.015,.027,.075])for(const point of [{x:.31,y:.55},{x:.739,y:.103}]){
  const world=groundToCat3D(point,height,angle),screen=cat3DToGround(world,angle);
  near(screen.x,point.x);near(screen.y,point.y);near(world.y,height);
 }
 const point={x:.7,y:.12},angle=55,world=groundToCat3D(point,.027,angle),jump=.017;
 world.y+=jump/Math.cos(angle*Math.PI/180);
 near(cat3DToGround(world,angle).y,point.y-jump/(9/16));
});
test('continuous 3D yaw preserves screen headings in all directions and wraps through shortest turn',()=>{
 for(let i=0;i<24;i++){
  const heading=i*Math.PI/12,yaw=cat3DHeading(heading),dx=Math.sin(yaw),dy=Math.cos(yaw)*Math.sin(55*Math.PI/180);
  near(Math.atan2(Math.sin(Math.atan2(dy,dx)-heading),Math.cos(Math.atan2(dy,dx)-heading)),0);
 }
 const previous=Math.PI-.02,result=smoothCat3DYaw(previous,-Math.PI+.02,1/60);
 assert.ok(result>previous&&result-previous<.04);near(smoothCat3DYaw(previous,0,0),previous);
});
test('gait phase follows actual ground distance, scales to model stride, and does not run during pause or teleport',()=>{
 const cal=normalizeCat3DCalibration({modelLength:.7,walkStride:.35});
 const cat={x:.5,y:.5,customization:{size:1}},width=cat3DVisualWidth(cat,{scale:.065});
 near(cat3DStrideAdvance(width*.5,width,cal),1);
 near(cat3DStrideAdvance(0,width,cal),0);near(cat3DStrideAdvance(.2,width,cal),0);
 assert.ok(cat3DGroundDistance(cat,{x:.5,y:.51})>.01*(9/16));
 near(cat3DVisualWidth({...cat,customization:{size:1.35}},{scale:.065})/width,1.35);
});
test('semantic actions select authored body motion without overwriting food groom phase',()=>{
 assert.equal(cat3DAction({state:'walk',speed:.03,heading:0}),'Walk');
 assert.equal(cat3DAction({state:'walk',speed:.03,heading:Math.PI}),'Walk');
 assert.equal(cat3DAction({state:'sleep'}),'Sleep');assert.equal(cat3DAction({state:'rest'}),'Rest');
 assert.equal(cat3DAction({state:'eat'}),'Eat');assert.equal(cat3DAction({state:'groom'}),'Groom');
 assert.equal(cat3DAction({state:'jump',traverse:{style:'jump',direction:'down'}}),'HopDown');
 assert.equal(cat3DAction({state:'crouch',traverse:{style:'jump',direction:'up'}}),'HopUp');
});
test('jump clip sections meet continuously at crouch, airborne and touchdown boundaries',()=>{
 const cal=normalizeCat3DCalibration(),sample=(phase,progress)=>cat3DClipTime('HopUp',{traverse:{phase,progress}},1,{calibration:cal});
 near(sample('crouch',1),sample('jump',0));near(sample('jump',1),sample('land',0));
 assert.ok(sample('land',1)>.99&&sample('land',1)<1);
 near(cat3DClipTime('Walk',{},2,{walkPhase:1.25}),.5);
});
test('root travel is frozen without erasing pelvis or foot animation channels',()=>{
 const make=name=>({name,values:new Float32Array([1,2,3,4,5,6]),clone(){return {...this,values:this.values.slice()}}});
 const root=make('Root.position'),fixed=freezeCat3DRootTrack(root,['Root']);
 assert.deepEqual([...fixed.values],[1,2,3,1,2,3]);assert.deepEqual([...root.values],[1,2,3,4,5,6]);
 for(const name of ['Pelvis.position','Paw_L.position','Root.quaternion']){const track=make(name);assert.equal(freezeCat3DRootTrack(track,['Root']),track)}
});
test('invalid metadata cannot introduce infinity or negative framing dimensions',()=>{
 const cal=normalizeCat3DCalibration({modelLength:-1,scale:Infinity,cameraElevationDegrees:1000,rootMotionNodes:'Root',footBones:null});
 assert.ok(cal.modelLength>0);assert.equal(cal.scale,1);assert.equal(cal.cameraElevationDegrees,80);assert.deepEqual(cal.rootMotionNodes,[]);
});

test('unbuilt non-moving actions retain the same 3D model with explicit Idle fallback; missing leaps cannot pass',()=>{
 for(const request of ['Sleep','Eat','Rest','Groom']){const result=resolveCat3DClip(request,['Idle','Walk']);assert.equal(result.clip,'Idle');assert.equal(result.requestedAction,request);assert.equal(result.fallback,true);assert.equal(result.missingClip,request)}
 for(const request of ['HopUp','HopDown']){const result=resolveCat3DClip(request,['Idle','Walk']);assert.equal(result.clip,null);assert.equal(result.jumpReady,false);assert.equal(result.missingClip,request)}
 const ready=resolveCat3DClip('HopUp',['Idle','Walk','HopUp']);assert.equal(ready.clip,'HopUp');assert.equal(ready.jumpReady,true);assert.equal(ready.fallback,false);
});


test('full interaction mapping respects movement, food phases and independent tools',()=>{
 const food={tool:'food',phase:'interact'};
 assert.equal(cat3DAction({state:'groom',task:food}),'Groom');
 assert.equal(cat3DAction({state:'observe',task:food}),'Idle');
 assert.equal(cat3DAction({state:'eat',task:food}),'Eat');
 for(const [tool,clip]of [['scratch','Scratch'],['pet','Pet'],['yarn','Play'],['mouse','Play'],['wand','Play']]){
  assert.equal(cat3DAction({state:'interact',task:{tool,phase:'interact'}}),clip);
  assert.equal(cat3DAction({state:'approach',speed:.02,task:{tool,phase:'approach'}}),'Walk');
 }
});
test('sleep intro happens once before a continuous resting loop',()=>{
 const calibration=normalizeCat3DCalibration({clipLoops:{Sleep:{start:.8,end:2.8},Rest:{start:-1,end:0}}});
 const sample=actionAge=>cat3DClipTime('Sleep',{},3,{calibration,actionAge,time:37});
 near(sample(.4),.4);near(sample(.8),.8);near(sample(2.9),.9);near(sample(100.8),.8);
 assert.equal(calibration.clipLoops.Rest,undefined);
});

test('plush rest poses follow actual build morphology while retaining sleep semantics',()=>{
 const clips=['Idle','Sleep','Rest','SleepPlush','RestPlush'];
 for(const action of ['Sleep','Rest']){
  const fluffy=resolveCat3DClip(action,clips,{fluff:1,morphs:{Build:.2}});assert.equal(fluffy.clip,`${action}Plush`);assert.equal(fluffy.requestedAction,action);assert.equal(fluffy.fallback,false);
  assert.equal(resolveCat3DClip(action,clips,{fluff:.1,morphs:{Build:.9}}).clip,`${action}Plush`);
  assert.equal(resolveCat3DClip(action,clips,{fluff:.1,build:.9,morphs:{Build:.1}}).clip,action);
  assert.equal(resolveCat3DClip(action,['Idle','Sleep','Rest'],{fluff:1}).clip,action);
 }
});
