import test from 'node:test';
import assert from 'node:assert/strict';
import {createMuyuStroke,sampleMuyuStroke,createMuyuPressGesture,MUYU_CONTACT_MS,MUYU_CONTACT_HOLD_MS,MUYU_STROKE_MS} from '../src/themes/muyu/motion.js';
import {MuyuModel} from '../src/themes/muyu/model.js';
const event=(at=0,id=1)=>({type:'strike',id,strokeId:id,source:'manual',at,impactAt:at+MUYU_CONTACT_MS});
const pointer=(extra={})=>({pointerId:1,clientX:100,clientY:100,button:0,...extra});
const near=(a,b,eps=.00001)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const model=()=>new MuyuModel(null,{now:()=>new Date(2026,9,13,12).getTime()});

test('one stroke timeline approaches, contacts and returns without hit-event branching',()=>{
 const stroke=createMuyuStroke(null,event());
 assert.equal(sampleMuyuStroke(stroke,0).amount,0);assert.equal(sampleMuyuStroke(stroke,20).phase,'fall');
 assert.ok(sampleMuyuStroke(stroke,70).amount>sampleMuyuStroke(stroke,30).amount);
 const impact=sampleMuyuStroke(stroke,100);assert.equal(impact.amount,1);assert.equal(impact.rotation,0);assert.equal(impact.lift,0);assert.equal(impact.contactAt,100);
 assert.equal(sampleMuyuStroke(stroke,100+MUYU_CONTACT_HOLD_MS-1).amount,1);
 assert.ok(sampleMuyuStroke(stroke,180).amount<1);assert.ok(sampleMuyuStroke(stroke,280).amount<sampleMuyuStroke(stroke,180).amount);assert.equal(sampleMuyuStroke(stroke,MUYU_STROKE_MS).active,false);
});
test('all phase boundaries are position continuous, including anticipation and contact',()=>{
 const stroke=createMuyuStroke(null,event());for(const at of [14,100,140,240,340])for(const prop of ['amount','rotation','lift'])near(sampleMuyuStroke(stroke,at-.00001)[prop],sampleMuyuStroke(stroke,at+.00001)[prop]);
});
test('first movement has less than one scene-pixel of preparation, never a large lift',()=>{
 const stroke=createMuyuStroke(null,event());for(let t=0;t<14;t++){const pose=sampleMuyuStroke(stroke,t);assert.ok(pose.lift>=-.65);assert.ok(pose.amount>=-.01);assert.ok(Math.abs(pose.rotation)<=.004)}
});
test('rapid new stroke starts from exact current pose during rebound instead of teleporting to rest',()=>{
 const previous=createMuyuStroke(null,event());for(const at of [101,160,230,280]){
  const from=sampleMuyuStroke(previous,at),next=createMuyuStroke(previous,event(at,at));const actual=sampleMuyuStroke(next,at);
  for(const property of ['amount','rotation','lift'])near(actual[property],from[property]);assert.equal(sampleMuyuStroke(next,at+100).amount,1);
 }
});
test('inputs sharing the next physical contact never restart the visible stroke',()=>{
 const previous=createMuyuStroke(null,event());assert.equal(createMuyuStroke(previous,{...event(),id:2}),previous);
 const m=model();m.requestStrike('manual',0);m.requestStrike('manual',30);m.requestStrike('manual',90);const strikes=m.events.filter(e=>e.type==='strike');assert.equal(new Set(strikes.map(e=>e.strokeId)).size,1);assert.deepEqual(strikes.map(e=>e.impactAt),[100,100,100]);m.tick(99);assert.equal(m.state.stats.total,0);m.tick(100);assert.equal(m.state.stats.total,3);assert.equal(new Set(m.events.filter(e=>e.type==='hit').map(e=>e.id)).size,3);assert.ok(m.events.filter(e=>e.type==='hit').every(e=>e.at===100));
});
test('100 press-and-release gestures count100, release does not produce a second strike',()=>{
 const m=model();let focus=0;const gesture=createMuyuPressGesture({usable:()=>true,hitAt:()=> 'wood',focusWood:()=>focus++,activate:()=>m.requestStrike('manual',0)});
 for(let i=0;i<100;i++){gesture.down(pointer());gesture.up(pointer())}assert.equal(focus,100);m.tick(100);assert.equal(m.state.stats.manual,100);assert.equal(m.events.filter(e=>e.type==='hit').length,100);
});
test('holding left mouse or repeating pointerdown does not retrigger',()=>{
 const m=model();const gesture=createMuyuPressGesture({usable:()=>true,hitAt:()=> 'wood',activate:()=>m.requestStrike('manual',0)});
 for(let i=0;i<100;i++)gesture.down(pointer());m.tick(100);assert.equal(m.state.stats.manual,1);gesture.up(pointer());m.tick(200);assert.equal(m.state.stats.manual,1);
});
test('UI occlusion, wrong button and non-wood presses never accidentally strike',()=>{
 let calls=[];const blocked=createMuyuPressGesture({usable:()=>false,hitAt:()=> 'wood',activate:hit=>calls.push(hit)});blocked.down(pointer());blocked.up(pointer());assert.deepEqual(calls,[]);
 const input=createMuyuPressGesture({usable:()=>true,hitAt:()=> 'lamp',activate:hit=>calls.push(hit)});input.down(pointer({button:2}));input.up(pointer({button:2}));assert.deepEqual(calls,[]);input.down(pointer());assert.deepEqual(calls,[]);input.up(pointer());assert.deepEqual(calls,['lamp']);
});
test('cancelled/moved gestures and other pointers cannot finish a non-wood interaction',()=>{
 const calls=[],gesture=createMuyuPressGesture({usable:()=>true,hitAt:()=> 'beads',activate:hit=>calls.push(hit)});gesture.down(pointer());gesture.up(pointer({pointerId:2}));assert.deepEqual(calls,[]);gesture.up(pointer());assert.deepEqual(calls,['beads']);gesture.down(pointer());gesture.cancel();gesture.up(pointer());gesture.down(pointer());gesture.up(pointer({clientX:130}));assert.equal(calls.length,1);
});
test('reduced motion still reaches the same contact and returns continuously',()=>{
 const stroke=createMuyuStroke(null,event(),{reducedMotion:true});for(let t=0;t<=340;t++){const pose=sampleMuyuStroke(stroke,t);assert.equal(pose.lift,0);assert.equal(pose.rotation,0)}assert.equal(sampleMuyuStroke(stroke,100).amount,1);near(sampleMuyuStroke(stroke,339.999).amount,0);
});
test('planned hit timestamp stays tied to motion contact even if a render frame is late',()=>{
 const m=model();m.requestStrike('manual',0);const stroke=createMuyuStroke(null,m.events[0]);m.tick(128);const hit=m.events.find(e=>e.type==='hit');assert.equal(hit.at,100);assert.equal(hit.processedAt,128);assert.equal(sampleMuyuStroke(stroke,hit.processedAt).amount,1);
});
