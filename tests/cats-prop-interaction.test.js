import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {placedProps,hitPlacedProp,propHitBounds,interactWithPlacedProp} from '../src/themes/cats/prop-interaction.js';
import {worldToScreen,screenToWorld,coverTransform} from '../src/themes/cats/geometry.js';
const make=()=>new CatGame(null,{random:()=>.4});

test('all visible placed objects are manageable, while petting feedback is not treated as furniture',()=>{
 const props=['scratch','food','yarn','mouse','wand','pet'].map((tool,i)=>({id:String(i),tool,x:.6,y:.65,persistent:tool==='scratch'}));
 assert.deepEqual(placedProps(props).map(p=>p.tool),['scratch','food','yarn','mouse','wand']);
 for(const prop of props.slice(0,5))assert.equal(hitPlacedProp([prop],prop)?.id,prop.id);
 assert.equal(hitPlacedProp([props.at(-1)],props.at(-1)),null);
});

test('prop picking tracks the visible artwork and enlarged food bowls across viewport transforms',()=>{
 for(const [width,height] of [[1600,900],[1045,905],[390,844]]){
  const cover=coverTransform(width,height),prop={id:'bowl',tool:'food',x:.65,y:.57,foodScale:2.4};
  const visibleLip={x:prop.x+15*2.4/1600,y:prop.y};
  const cursor=screenToWorld(worldToScreen(visibleLip,cover),cover);
  assert.equal(hitPlacedProp([prop],cursor,cover.drawWidth),prop);
  const bounds=propHitBounds(prop,cover.drawWidth);
  assert.equal(hitPlacedProp([prop],{x:bounds.right+.001,y:prop.y},cover.drawWidth),null);
 }
 const wand={id:'wand',tool:'wand',x:.6,y:.6};
 assert.equal(hitPlacedProp([wand],{x:.6+14/1600,y:.6-54/900}),wand,'pick the visible top of the stick');
});

test('removing a used prop cancels only its owners and scratchboards stay removed after reload',()=>{
 const game=make(),[a,b]=game.cats;
 const board=game.command('scratch',a,a.id);assert.ok(board.ok);
 const other=game.command('yarn',b,b.id);assert.ok(other.ok);
 assert.ok(game.removeProp(board.propId).ok);
 assert.equal(a.task,null);assert.equal(b.task.propId,other.propId);
 assert.ok(!game.props.some(p=>p.id===board.propId));
 assert.ok(!new CatGame(game.snapshot()).props.some(p=>p.id===board.propId));
 assert.equal(game.removeProp(board.propId).ok,false);
});

test('food, yarn, mouse and wand can each be collected while a cat is approaching or playing',()=>{
 for(const tool of ['food','yarn','mouse','wand']){
  const game=make(),cat=game.cats[0],placed=game.command(tool,cat,cat.id);
  assert.ok(placed.ok,tool);assert.equal(cat.task.propId,placed.propId);
  assert.ok(game.removeProp(placed.propId).ok);assert.equal(cat.task,null);
  assert.equal(cat.target,null);assert.deepEqual(cat.path,[]);
  for(let i=0;i<20;i++)game.update(1/30,{});
  assert.ok(!game.props.some(p=>p.id===placed.propId));
 }
});

test('putting away a shared food bowl immediately frees cats already eating',()=>{
 const game=make(),placed=game.command('food',{x:.56,y:.59});assert.ok(placed.ok);
 for(let i=0;i<1800&&!game.cats.some(cat=>cat.state==='eat');i++)game.update(1/60,{});
 assert.ok(game.cats.some(cat=>cat.state==='eat'),'fixture reached eating, rather than only approach');
 assert.ok(game.removeProp(placed.propId).ok);
 assert.ok(game.cats.every(cat=>cat.task?.propId!==placed.propId&&cat.state!=='eat'));
 assert.ok(!game.props.some(prop=>prop.id===placed.propId));
});

test('mouse-transparent desktop clicks reuse scratchboards without opening an unreachable control',()=>{
 const game=make(),cat=game.cats[0],placed=game.command('scratch',cat,cat.id),board=game.props.find(prop=>prop.id===placed.propId);
 game.clearTransient();assert.equal(cat.task,null);let opened=0,result;
 const handled=interactWithPlacedProp(board,{desktopMode:true,onOpen:()=>opened++,onUse:id=>{result=game.useProp(id,cat.id)}});
 assert.equal(handled,true);assert.equal(opened,0);assert.ok(result.ok);assert.equal(cat.task.propId,board.id);assert.equal(game.props.length,1);
 const temporary={id:'temporary',tool:'food',persistent:false};
 assert.equal(interactWithPlacedProp(temporary,{desktopMode:true,onOpen:()=>opened++,onUse:()=>assert.fail('temporary props retain the normal scene handler')}),false);
 assert.equal(opened,0);
 let selected=null;assert.equal(interactWithPlacedProp(board,{desktopMode:false,onOpen:prop=>selected=prop,onUse:()=>assert.fail('control window selects instead of starting play')}),true);
 assert.equal(selected.id,board.id);
});
