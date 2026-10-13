import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createCatFurGeometry,addCatFur,catFurRegion} from '../src/themes/cats/three-cat-fur.js';
import {buildCatBoneBounds,updateCatBoneBounds} from '../src/themes/cats/three-cat-bounds.js';
async function load(){const bytes=fs.readFileSync(new URL('../public/assets/cats/3d/courtyard-cat.glb',import.meta.url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
function bodyOf(model){let result;model.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes('Body'))result=o});return result;}

test('fur stays bounded in cost and keeps normalized skinning off the eyes, muzzle and grounded paws',async()=>{
 const gltf=await load(),source=bodyOf(gltf.scene).geometry,fur=createCatFurGeometry(source,THREE),a=fur.attributes;
 assert.equal(fur.userData.tuftCount,1800);assert.equal(fur.index.count/3,3600);assert.equal(a.position.count,7200);assert.equal(fur.morphAttributes.position.length,source.morphAttributes.position.length+1);
 let faceRoots=0;
 for(let i=0;i<a.position.count;i++){
  const root=new THREE.Vector3().fromBufferAttribute(a.furRoot,i);assert.ok(root.y>=.095-1e-6);assert.ok(!(root.z>.305&&Math.abs(root.x)<.045&&root.y<.435),'bare nose/lips stay visible');assert.ok(!(root.y>.49&&root.z>.12&&Math.abs(root.x)>.032),'ear interiors stay clear');
  if(root.z>.265)assert.ok(((Math.abs(root.x)-.054)/.044)**2+((root.y-.460)/.033)**2>=1-1e-5,'enlarged eye opening stays unobstructed');
  if(root.z>.24)faceRoots++;
  const weights=[a.skinWeight.getX(i),a.skinWeight.getY(i),a.skinWeight.getZ(i),a.skinWeight.getW(i)];assert.ok(weights.every(weight=>Number.isFinite(weight)&&weight>=0));assert.ok(Math.abs(weights.reduce((sum,weight)=>sum+weight,0)-1)<1e-6);
  for(const attr of [a.position,a.normal,...fur.morphAttributes.position])assert.ok(Number.isFinite(attr.getX(i))&&Number.isFinite(attr.getY(i))&&Number.isFinite(attr.getZ(i)));
 }
 assert.ok(faceRoots>40,'short forehead/cheek fur is present instead of excluding the entire face');
});
test('two cats share fur geometry, attach to independent skeletons, retain morphs and release references safely',async()=>{
 const gltf=await load(),a=clone(gltf.scene),b=clone(gltf.scene),bodyA=bodyOf(a),bodyB=bodyOf(b);bodyA.morphTargetInfluences[0]=.6;
 const fa=addCatFur(a,THREE,{fluff:1}),fb=addCatFur(b,THREE,{fluff:.1});assert.equal(fa.mesh.geometry,fb.mesh.geometry);assert.equal(fa.mesh.skeleton,bodyA.skeleton);assert.equal(fb.mesh.skeleton,bodyB.skeleton);assert.notEqual(fa.mesh.skeleton,fb.mesh.skeleton);
 assert.equal(fa.mesh.morphTargetInfluences[0],.6);assert.equal(fa.mesh.morphTargetInfluences[fa.mesh.morphTargetDictionary.FurLength],1);assert.equal(fb.mesh.morphTargetInfluences[fb.mesh.morphTargetDictionary.FurLength],.1);
 let disposed=0;fa.mesh.geometry.addEventListener('dispose',()=>{disposed++});fa.dispose();assert.equal(disposed,0);assert.equal(fa.mesh.parent,null);assert.ok(fb.mesh.parent);fb.dispose();assert.equal(disposed,1);fb.dispose();assert.equal(disposed,1);
 assert.ok(bodyA.geometry.attributes.position.count>0);
});
test('fur follows actual articulated poses and its cached bounds cover all moving strands',async()=>{
 const gltf=await load(),fur=addCatFur(gltf.scene,THREE,{fluff:1}),mesh=fur.mesh,mixer=new THREE.AnimationMixer(gltf.scene),cache=buildCatBoneBounds(mesh),box=new THREE.Box3(),point=new THREE.Vector3();
 const clips=new Map(gltf.animations.map(clip=>[clip.name,clip]));
 for(const name of ['Walk','HopUp','Sleep','Eat']){
  mixer.stopAllAction();const clip=clips.get(name),action=mixer.clipAction(clip).play();action.paused=true;
  for(const t of [.15,.65,.98]){action.time=clip.duration*t;mixer.update(0);gltf.scene.updateMatrixWorld(true);updateCatBoneBounds(cache,box).expandByScalar(1e-5);for(let i=0;i<mesh.geometry.attributes.position.count;i+=7){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);assert.ok(box.containsPoint(point),`${name}:${t} strand ${i}`)}}
 }
 fur.dispose();
});


test('groomed locks concentrate on ruff, cheeks and tail while torso stays short',async()=>{
 assert.equal(catFurRegion([.10,.33,-.08]),0);
 assert.ok(catFurRegion([.10,.34,.20])>.9);
 assert.ok(catFurRegion([.02,.43,-.28])>.9);
 const gltf=await load(),fur=createCatFurGeometry(bodyOf(gltf.scene).geometry,THREE),regions=fur.attributes.furRegion,extra=fur.morphAttributes.position.at(-1);
 let longCount=0,longSum=0,shortCount=0,shortSum=0;
 for(let i=3;i<regions.count;i+=4){const extension=Math.hypot(extra.getX(i),extra.getY(i),extra.getZ(i));if(regions.getX(i)>.8){longCount++;longSum+=extension;}else if(regions.getX(i)<.1){shortCount++;shortSum+=extension;}}
 assert.ok(longCount>250&&shortCount>250,'both regional and short coat retain coverage');
 assert.ok(longSum/longCount>shortSum/shortCount*1.8,'plume and ruff remain substantially longer than visible laid torso strokes');
 fur.dispose();
});
