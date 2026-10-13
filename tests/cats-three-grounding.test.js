import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCat3DRigInstance,disposeCat3DRigInstance,groundCat3DTransition} from '../src/themes/cats/three-cat-renderer.js';
import {normalizeCat3DCalibration} from '../src/themes/cats/three-cat-mapping.js';
import {getCat3DAppearance} from '../src/themes/cats/three-cat-appearance.js';

async function source(){
 const bytes=await readFile(new URL('../public/assets/cats/3d/courtyard-cat.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const manifest=JSON.parse(await readFile(new URL('../public/assets/cats/3d/courtyard-cat.json',import.meta.url),'utf8'));
 return {gltf,cal:normalizeCat3DCalibration(manifest),clips:new Map(gltf.animations.map(clip=>[clip.name,clip]))};
}
function morphology(model,cat){
 const style=getCat3DAppearance(cat.presetId,cat.customization);
 model.traverse(mesh=>{for(const [name,index]of Object.entries(mesh.morphTargetDictionary||{}))mesh.morphTargetInfluences[index]=style.morphs[name]||0});
 return {style,dispose(){}};
}
function blend(instance,from,to,alpha){
 for(const action of instance.actions.values())action.setEffectiveWeight(0);
 for(const [name,weight]of [[from,1-alpha],[to,alpha]]){const action=instance.actions.get(name);action.time=action.getClip().duration*.25;action.setEffectiveWeight(weight)}
 instance.blendState={layers:[{name:from,weight:1-alpha},{name:to,weight:alpha}]};
 instance.mixer.update(0);instance.pivot.updateMatrixWorld(true);
}
function fullSkinMinimum(instance){
 const body=instance.meshes.find(mesh=>mesh.name==='CourtyardCatBody'),point=new THREE.Vector3();let min=Infinity;
 for(let i=0;i<body.geometry.attributes.position.count;i++){body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);min=Math.min(min,point.y)}
 return min;
}

test('real short and plush cat skin stays above ground throughout sleep/wake blends without changing game coordinates',async()=>{
 const {gltf,cal,clips}=await source();let reproduced=false;
 for(const presetId of ['british-shorthair','ragdoll'])for(const build of [1,1.25]){
  const cat={id:presetId,presetId,x:.42,y:.67,customization:{build}},saved=structuredClone(cat);
  const instance=createCat3DRigInstance(gltf.scene,clips,cal,cat,{style:morphology}),style=instance.style.style;
  const suffix=style.fluff>.6||style.morphs.Build>.65?'Plush':'',sleep='Sleep'+suffix,rest='Rest'+suffix;
  instance.pivot.rotation.y=.73;
  for(const [from,to]of [['Idle',sleep],[sleep,'Idle'],[rest,sleep],[sleep,rest]])for(const alpha of [.1,.25,.5,.75,.9]){
   instance.offset.position.y=cal.groundOffset;blend(instance,from,to,alpha);
   const before=fullSkinMinimum(instance);reproduced ||= before<-.02;
   const result=groundCat3DTransition(instance,cal),after=fullSkinMinimum(instance);
   assert.ok(result.active);assert.ok(result.probeCount>500);assert.ok(result.probeCount<=instance.meshes.find(mesh=>mesh.name==='CourtyardCatBody').geometry.attributes.position.count);
   assert.ok(after>=-1e-6,`${presetId} build${build} ${from}->${to}@${alpha}: skin ${after}`);
   assert.ok(Math.abs(after-(before+result.lift))<1e-7,'correction matches actual deformed skin, not an approximate bone-origin offset');
   assert.ok(result.lift<=.035,'only the bounded blend defect is corrected');
   const once=instance.offset.position.y;groundCat3DTransition(instance,cal);assert.ok(Math.abs(instance.offset.position.y-once)<1e-9,'paused/repeated frames never accumulate lift');
   const contacts=[...instance.transitionSupport.contacts.values()];assert.equal(contacts.length,4);assert.ok(contacts.every(contact=>contact.minY>=-1e-6));
  }
  assert.deepEqual(cat,saved);disposeCat3DRigInstance(instance);
 }
 assert.ok(reproduced,'this regression must exercise the original greater-than-2cm quaternion blend penetration');
});

test('steady rest, sleep and ordinary blends do no full-skin work and immediately clear transient lift',async()=>{
 const {gltf,cal,clips}=await source(),instance=createCat3DRigInstance(gltf.scene,clips,cal,{id:'steady',presetId:'ragdoll'},{style:morphology});
 const prewarmed=instance.transitionSupport;assert.ok(prewarmed?.probeCount>500,'support is prepared on load, not on the first visible lie-down');
 blend(instance,'Idle','Walk',.5);const ordinary=groundCat3DTransition(instance,cal);assert.equal(ordinary.active,false);assert.equal(ordinary.probeCount,0);assert.ok(instance.transitionSupport===prewarmed);
 blend(instance,'Idle','SleepPlush',.5);const raised=groundCat3DTransition(instance,cal),cache=instance.transitionSupport;
 assert.ok(raised.lift>.02);assert.ok(cache===prewarmed,'lying down reuses the load-time cache');
 for(const name of ['SleepPlush','RestPlush','Idle']){
  blend(instance,name,name,1);const result=groundCat3DTransition(instance,cal);
  assert.equal(result.active,false);assert.equal(result.probeCount,0);assert.equal(result.lift,0);assert.equal(instance.offset.position.y,cal.groundOffset);assert.equal(instance.transitionSupport,cache);
 }
 blend(instance,'SleepPlush','Idle',.5);groundCat3DTransition(instance,cal);assert.equal(instance.transitionSupport,cache,'fixed morphology support cache is reused');
 disposeCat3DRigInstance(instance);
});
