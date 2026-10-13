import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {acquireCatFurDetail} from '../src/themes/cats/three-cat-fur-detail.js';

test('neutral fur detail stays safe without DOM, shares uniforms and disposes only after the final cat',()=>{
 const a=acquireCatFurDetail(THREE),b=acquireCatFurDetail(THREE);assert.equal(a.ready.value,0);assert.equal(a.sampler,b.sampler);assert.equal(a.ready,b.ready);
 let disposed=0;a.sampler.value.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0);b.dispose();assert.equal(disposed,1);b.dispose();assert.equal(disposed,1);
 const next=acquireCatFurDetail(THREE);assert.notEqual(next.sampler,a.sampler);next.dispose();
});
test('asynchronous fur detail loads once and cannot resurrect a released theme',()=>{
 let requests=0,loaded,texture;
 const runtime={...THREE,TextureLoader:class{load(url,success){requests++;loaded=success;texture=new THREE.Texture();return texture}}};
 const a=acquireCatFurDetail(runtime,{enabled:true}),b=acquireCatFurDetail(runtime,{enabled:true});assert.equal(requests,1);assert.equal(a.ready.value,0);
 loaded(texture);assert.equal(a.ready.value,1);assert.equal(b.sampler.value,texture);assert.equal(texture.wrapS,THREE.RepeatWrapping);
 a.dispose();assert.equal(b.ready.value,1);b.dispose();assert.equal(b.ready.value,0);
 const c=acquireCatFurDetail(runtime,{enabled:true});let disposals=0;texture.addEventListener('dispose',()=>disposals++);c.dispose();loaded(texture);assert.equal(c.ready.value,0);assert.equal(disposals,1);
});
