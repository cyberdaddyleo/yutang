import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {CAT_PRESETS} from '../src/themes/cats/catalog.js';
import {DEFAULT_CAT_CUSTOMIZATION} from '../src/themes/cats/customization.js';
import {distance,isWalkable,surfaceAt,SLEEP_SLOT_MAP} from '../src/themes/cats/geometry.js';
import {bedRimVisible,supportedTraversalPoint} from '../src/themes/cats/traversal.js';

const STEP=1/30;
const point=p=>({x:p.x,y:p.y});
function make(presetId='ragdoll',size=1,build=1){
 let seed=731;const game=new CatGame(null,{random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});
 game.cats.slice(1).forEach(c=>game.archiveCat(c.id));const cat=game.cats[0];
 Object.assign(cat,{presetId,customization:{...DEFAULT_CAT_CUSTOMIZATION,size,build},x:.60,y:.40,state:'idle',wait:Infinity});
 return {game,cat};
}
function runUntil(game,done,{seconds=120,onFrame=()=>{},label='requested action'}={}){
 for(let i=0;i<seconds/STEP&&!done();i++){game.update(STEP,{});onFrame();}
 assert.ok(done(),`${label} did not finish within ${seconds}s: ${game.cats.filter(c=>c.active).map(c=>`${c.presetId} ${c.state} (${c.x.toFixed(4)},${c.y.toFixed(4)}) ${c.traverse?.feature||''}/${c.traverse?.phase||''}`).join('; ')}`);
}
function travel(game,cat,done,label,onFrame=()=>{}){
 const records=[],seen=new Set();let previous=point(cat),previousMove=cat.traverse;
 runUntil(game,done,{label,onFrame(){
  const move=cat.traverse;
  if(move&&!seen.has(move)){seen.add(move);records.push({move,from:point(move.from),to:point(move.to),phases:new Set(),peak:0});}
  if(move){const r=records.find(r=>r.move===move);r.phases.add(move.phase);r.peak=Math.max(r.peak,move.jumpHeight||0);}
  const before=surfaceAt(previous)?.id,after=surfaceAt(cat)?.id;
  if((before==='bed')!==(after==='bed'))assert.equal((move||previousMove)?.feature,'bed',`${label}: crossed the painted mat rim without its explicit jump`);
  previous=point(cat);previousMove=move;onFrame();
 }});
 return records.filter(r=>r.move.feature==='bed');
}
function assertMatJump(records,direction,label){
 assert.equal(records.length,1,`${label}: one committed mat crossing, without repeated edge hops`);
 const r=records[0];assert.equal(r.move.direction,direction);assert.equal(r.move.style,'jump');
 assert.deepEqual([...r.phases].sort(),['crouch','jump','land']);assert.ok(r.peak>.006,`${label}: visible airborne clearance`);
 assert.ok(isWalkable(r.from)&&isWalkable(r.to));
 assert.equal(surfaceAt(direction==='up'?r.to:r.from)?.id,'bed');
 assert.notEqual(surfaceAt(direction==='up'?r.from:r.to)?.id,'bed');
 // Check the actual crossing, rather than assuming the labelled portal was used.
 let last=surfaceAt(r.from)?.id,crossings=0;
 for(let i=1;i<=200;i++){
  const t=i/200,p={x:r.from.x+(r.to.x-r.from.x)*t,y:r.from.y+(r.to.y-r.from.y)*t},id=surfaceAt(p)?.id;
  if((last==='bed')!==(id==='bed')){crossings++;assert.ok(p.x>=.716-1e-4&&p.x<=.77+1e-4&&p.y>.145,`${label}: crossed the side/back rim at ${JSON.stringify(p)}`);}
  last=id;
 }
 assert.equal(crossings,1);
}

for(const preset of CAT_PRESETS)test(`${preset.name}: small, ordinary and large bodies enter and leave through a single front-rim jump`,()=>{
 for(const [size,build] of [[.70,.80],[1,1],[1.35,1.25]]){
  const {game,cat}=make(preset.id,size,build),label=`${preset.id} size=${size}`;
  assert.ok(game.visitFacility('bed',cat.id).ok);assert.equal(cat.restIntent.surfaceId,'bed');
  assertMatJump(travel(game,cat,()=>cat.state==='sleep'&&!cat.traverse,`${label} up`),'up',label);
  assert.ok(distance(cat,cat.restIntent.target)<.004);assert.equal(surfaceAt(cat)?.id,'bed');
  assert.ok(game.visitFacility('sun',cat.id).ok);
  assertMatJump(travel(game,cat,()=>cat.state==='rest'&&!cat.traverse,`${label} down`),'down',label);
  assert.equal(surfaceAt(cat)?.id,'ground');
 }
});

for(const occupiedId of ['bed-left','bed-right'])for(const [visitorSize,residentSize] of [[1,1],[1.35,1],[1,1.35],[1.35,1.35]])test(`mat occupancy ${occupiedId}, visitor ${visitorSize}, resident ${residentSize}: safe separate landing or another rest site`,()=>{
 const {game,cat}=make('maine-coon',visitorSize,1.25),resident=game.cats[1],slot=SLEEP_SLOT_MAP[occupiedId];
 Object.assign(resident,{active:true,...point(slot),customization:{...DEFAULT_CAT_CUSTOMIZATION,size:residentSize,build:1.25},state:'sleep',wait:Infinity,sleepSlotId:slot.id,restIntent:{slotId:slot.id,surfaceId:'bed',target:point(slot),kind:'sleep'},path:[],target:null});
 assert.ok(game.visitFacility('bed',cat.id).ok);assert.notEqual(cat.restIntent.slotId,slot.id);
 if(visitorSize===1.35&&residentSize===1.35)assert.notEqual(cat.restIntent.surfaceId,'bed','two maximum bodies do not fit side by side');
 const separation=.045*Math.max(.82,(visitorSize+residentSize)/2),check=()=>assert.ok(distance(cat,resident)>=separation-1e-5,`cats overlap: ${distance(cat,resident)} < ${separation}`);
 const targetSurface=cat.restIntent.surfaceId;
 const up=travel(game,cat,()=>cat.state==='sleep'&&!cat.traverse,'occupied mat entry',check);
 assert.equal(surfaceAt(cat)?.id,targetSurface);
 if(targetSurface==='bed')assertMatJump(up,'up','occupied mat');
 assert.ok(game.visitFacility('sun',cat.id).ok);
 const down=travel(game,cat,()=>cat.state==='rest'&&!cat.traverse,'occupied mat departure',check);
 if(targetSurface==='bed')assertMatJump(down,'down','occupied mat');
});

for(const progress of [.25,.75])test(`saving and clearing a mat jump at ${progress} restores supported feet and the original rest intent`,()=>{
 const {game,cat}=make();assert.ok(game.visitFacility('bed',cat.id).ok);
 runUntil(game,()=>cat.traverse?.feature==='bed'&&cat.traverse.phase==='jump'&&cat.traverse.jumpProgress>=progress,{label:'mat takeoff'});
 const supported=supportedTraversalPoint(cat),live=point(cat),slot=cat.restIntent.slotId,snapshot=game.snapshot(),saved=snapshot.cats.find(c=>c.id===cat.id);
 assert.deepEqual(point(saved),supported);assert.equal(saved.traverse,undefined);assert.ok(isWalkable(saved));assert.deepEqual(point(cat),live,'saving does not teleport the live cat');
 const restored=new CatGame(snapshot),copy=restored.cats.find(c=>c.id===cat.id);
 assert.equal(copy.traverse,null);assert.equal(copy.restIntent.slotId,slot);
 runUntil(restored,()=>copy.state==='sleep'&&!copy.traverse,{label:'saved mat intent'});assert.equal(surfaceAt(copy)?.id,'bed');
 game.clearTransient();assert.equal(cat.traverse,null);assert.deepEqual(point(cat),supported);assert.equal(cat.restIntent.slotId,slot);assert.ok(isWalkable(cat));
 runUntil(game,()=>cat.state==='sleep'&&!cat.traverse,{label:'cleared mat intent'});assert.equal(surfaceAt(cat)?.id,'bed');
});

test('the painted front rim remains in front of an airborne cat whose ground projection is inside the mat',()=>{
 const {game,cat}=make();assert.ok(game.visitFacility('bed',cat.id).ok);let airborneBehindRim=0;
 travel(game,cat,()=>cat.state==='sleep'&&!cat.traverse,'rim layering',()=>{
  if(cat.traverse?.feature==='bed'&&cat.traverse.phase==='jump'&&cat.surfaceId==='air'&&surfaceAt(cat)?.id==='bed'){
   airborneBehindRim++;assert.equal(bedRimVisible(cat),true);
  }
 });
 assert.ok(airborneBehindRim>0,'observed actual airborne frames inside the mat');
 assert.equal(bedRimVisible(cat),true);
 assert.equal(!!bedRimVisible({x:.6,y:.4,surfaceId:'ground'}),false);
});
