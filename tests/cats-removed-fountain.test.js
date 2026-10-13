import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {FACILITIES,OBSTACLES,isWalkable,hitFacility,segmentWalkable} from '../src/themes/cats/geometry.js';

test('removed fountain leaves no facility, obstacle, or autonomous drinking task',()=>{
 assert.equal(FACILITIES.fountain,undefined);
 assert.equal(OBSTACLES.some(obstacle=>obstacle.id.startsWith('fountain')),false);
 const point={x:.7652,y:.6236};assert.ok(isWalkable(point));assert.notEqual(hitFacility(point)?.id,'fountain');
 assert.ok(segmentWalkable({x:.7,y:.62},{x:.82,y:.62}));
 const game=new CatGame(null,{random:()=>.5});assert.equal(game.visitFacility('fountain').ok,false);
 for(let i=0;i<60*180;i++){game.update(1/60);assert.ok(game.cats.every(cat=>cat.task?.facilityId!=='fountain'));}
});

test('removing fountain preserves saved cats and scratch boards; original water bowl still works',()=>{
 const original=new CatGame(null,{random:()=>.5});original.cats=original.cats.slice(0,1);
 const saved=original.snapshot();saved.cats[0].x=.7652;saved.cats[0].y=.6236;
 saved.props=[{id:'saved-scratch',tool:'scratch',x:.60,y:.70,persistent:true}];
 const game=new CatGame(saved,{random:()=>.5});assert.equal(game.cats[0].id,saved.cats[0].id);
 assert.equal(game.cats[0].x,.7652);assert.equal(game.cats[0].y,.6236);
 assert.equal(game.props[0].id,'saved-scratch');assert.equal(game.props[0].x,.60);assert.equal(game.props[0].y,.70);
 assert.equal(hitFacility(FACILITIES.water)?.id,'water');assert.equal(game.visitFacility('water',game.cats[0].id).ok,true);
 assert.deepEqual(game.cats[0].target,FACILITIES.water.approach);
 const after=new CatGame(game.snapshot());assert.equal(after.props[0].id,'saved-scratch');assert.equal(after.cats[0].id,saved.cats[0].id);
});
