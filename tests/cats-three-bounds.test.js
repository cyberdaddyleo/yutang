import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildCatBoneBounds,updateCatBoneBounds} from '../src/themes/cats/three-cat-bounds.js';
import {CatRiggedPilot,createCat3DRigInstance,disposeCat3DRigInstance,setCat3DEyelids} from '../src/themes/cats/three-cat-renderer.js';
import {normalizeCat3DCalibration,sampleCat3DBlend} from '../src/themes/cats/three-cat-mapping.js';
const modelUrl=new URL('../public/assets/cats/3d/courtyard-cat.glb',import.meta.url);
async function loadModel(){const bytes=await readFile(modelUrl);return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}

test('bone-local cached bounds enclose the real GLB vertices at every sampled walk and leap pose',async()=>{
 const gltf=await loadModel(),parent=new THREE.Group();parent.add(gltf.scene);parent.position.set(.2,.03,-.1);parent.scale.setScalar(.73);
 const meshes=[];gltf.scene.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node)});
 const caches=meshes.map(buildCatBoneBounds),mixer=new THREE.AnimationMixer(gltf.scene),exact=new THREE.Box3(),fast=new THREE.Box3(),vertex=new THREE.Vector3();
 assert.ok(meshes.length>0);assert.ok(caches.reduce((sum,cache)=>sum+cache.entries.length*8,0)<meshes.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0)/10,'frame work scales with bones rather than vertices');
 for(const clip of gltf.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip).play();action.paused=true;
  for(const fraction of [0,.2,.5,.8,.999])for(const yaw of [0,.67,1.6,3.1]){
   action.time=clip.duration*fraction;parent.rotation.y=yaw;mixer.update(0);parent.updateMatrixWorld(true);
   for(let i=0;i<meshes.length;i++){
    const mesh=meshes[i];exact.makeEmpty();for(let vertexIndex=0;vertexIndex<mesh.geometry.attributes.position.count;vertexIndex++){mesh.getVertexPosition(vertexIndex,vertex).applyMatrix4(mesh.matrixWorld);exact.expandByPoint(vertex)}
    updateCatBoneBounds(caches[i],fast).expandByScalar(1e-5);
    assert.ok(fast.containsBox(exact),`${clip.name}@${fraction} yaw=${yaw} mesh=${mesh.name}: cache must enclose exact skinned box`);
   }
  }
 }
});

test('actual mixer landing pose remains at last Hop sample when game removes traverse during transition',async()=>{
 const gltf=await loadModel(),pilot=new CatRiggedPilot();
 pilot.source=gltf.scene;pilot.state='ready';pilot.boneCount=28;
 pilot.calibration=normalizeCat3DCalibration();pilot.scene=new THREE.Scene();
 pilot.camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);pilot.camera.position.set(0,4,4);pilot.camera.lookAt(0,0,0);pilot.camera.updateMatrixWorld(true);
 pilot.ambient={intensity:1};pilot.keyLight={intensity:1};
 for(const clip of gltf.animations)pilot.clips.set(clip.name,clip);
 // The adapter's real sampling/blending, matrices, bounds and contacts execute;
 // only GPU submission is a no-op because this is a Node test.
 pilot.webgl={domElement:{width:192,height:192},info:{render:{triangles:0,calls:0}},setSize(width,height){this.domElement.width=width;this.domElement.height=height},render(){}};
 const cat={id:'qa',presetId:'ragdoll',active:true,x:.5,y:.5,heading:0,state:'crouch',speed:0,customization:{size:1},traverse:{style:'jump',direction:'up',phase:'land',progress:1}};
 pilot.select([cat]);
 const render=time=>pilot.render({cat,preset:{scale:.065},worldScale:1600,pixelRatio:1,time,light:{brightness:1}});
 render(1);const instance=pilot.instances.get(cat.id),hop=instance.actions.get('HopUp'),lastHop=hop.time,meshList=instance.meshes,pose=meshList[0].skeleton.bones.map(bone=>bone.quaternion.clone());
 assert.ok(lastHop>pilot.clips.get('HopUp').duration-.001);
 delete cat.traverse;cat.state='idle';render(1.016);
 assert.equal(hop.time,lastHop,'outgoing leap is frozen at the actual last displayed time, not re-sampled from cleared traverse');
 assert.equal(hop.getEffectiveWeight(),1);
 for(let i=0;i<pose.length;i++)assert.ok(1-Math.abs(pose[i].dot(meshList[0].skeleton.bones[i].quaternion))<1e-7,'first transition frame preserves the displayed landing pose');
 render(1.086);assert.equal(hop.time,lastHop);assert.ok(hop.getEffectiveWeight()>0&&hop.getEffectiveWeight()<1);
 render(1.2);assert.equal(hop.getEffectiveWeight(),0);assert.equal(instance.actions.get('Idle').getEffectiveWeight(),1);
});

test('interrupted blends snapshot displayed layer weights and freeze outgoing sample times',()=>{
 let state=sampleCat3DBlend(null,{action:'Walk',clipTime:.45,time:1});
 state=sampleCat3DBlend(state,{action:'HopUp',clipTime:.12,time:1.01});
 state=sampleCat3DBlend(state,{action:'HopUp',clipTime:.2,time:1.08});
 const displayed=state.layers.map(layer=>({...layer}));
 state=sampleCat3DBlend(state,{action:'Idle',clipTime:.5,time:1.09});
 for(const layer of displayed){const actual=state.layers.find(next=>next.name===layer.name);assert.equal(actual.time,layer.time);assert.equal(actual.weight,layer.weight)}
 state=sampleCat3DBlend(state,{action:'Idle',clipTime:.56,time:1.15});
 for(const old of displayed)assert.equal(state.layers.find(next=>next.name===old.name).time,old.time);
 assert.ok(Math.abs(state.layers.reduce((sum,layer)=>sum+layer.weight,0)-1)<1e-9);
});


test('skeletal instances share static geometry but never bones, mixer times, styles or morph weights',async()=>{
 const gltf=await loadModel(),clips=new Map(gltf.animations.map(clip=>[clip.name,clip])),cal=normalizeCat3DCalibration();
 const styles=[];const style=()=>{const entry={disposed:false,dispose(){this.disposed=true}};styles.push(entry);return entry};
 const a=createCat3DRigInstance(gltf.scene,clips,cal,{id:'a',presetId:'ragdoll'},{style});
 const b=createCat3DRigInstance(gltf.scene,clips,cal,{id:'b',presetId:'british-shorthair'},{style});
 assert.equal(a.meshes[0].geometry,b.meshes[0].geometry);
 assert.notEqual(a.meshes[0].skeleton,b.meshes[0].skeleton);assert.notEqual(a.meshes[0].skeleton.bones[0],b.meshes[0].skeleton.bones[0]);
 const original=b.meshes[0].skeleton.bones[0].quaternion.clone();a.actions.get('Walk').setEffectiveWeight(1);a.actions.get('Walk').time=.31;a.mixer.update(0);
 assert.equal(b.actions.get('Walk').time,0);assert.equal(b.actions.get('Walk').getEffectiveWeight(),0);
 assert.ok(b.meshes[0].skeleton.bones[0].quaternion.equals(original));
 disposeCat3DRigInstance(a);assert.equal(styles[0].disposed,true);assert.equal(styles[1].disposed,false);
 b.actions.get('Walk').setEffectiveWeight(1);b.actions.get('Walk').time=.7;b.mixer.update(0);assert.ok(b.meshes[0].geometry.attributes.position.count>0);
 disposeCat3DRigInstance(b);assert.equal(styles[1].disposed,true);
});

test('fixed morphology and changing eyelids use cached conservative bone bounds',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.1,0,0,.1,0,0,0,.2,0],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([-.06,0,0,.06,0,0,0,.03,0],3),new THREE.Float32BufferAttribute([0,.01,0,0,.01,0,0,-.12,0],3)];
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));mesh.updateMorphTargets();mesh.morphTargetDictionary={Build:0,CloseEyes:1};mesh.morphTargetInfluences=[.8,0];
 const cache=buildCatBoneBounds(mesh,{dynamicMorphs:['CloseEyes']}),exact=new THREE.Vector3(),box=new THREE.Box3();
 mesh.computeBoundingBox=()=>{throw new Error('must not re-skin the full mesh for each blink')};
 for(const close of [0,.2,.6,1]){mesh.morphTargetInfluences[1]=close;bone.rotation.z=.3;mesh.updateMatrixWorld(true);updateCatBoneBounds(cache,box);box.expandByScalar(1e-6);for(let i=0;i<3;i++){mesh.getVertexPosition(i,exact).applyMatrix4(mesh.matrixWorld);assert.ok(box.containsPoint(exact))}}
});

test('large breed eyes fully close and cached bounds contain every actual eyelid vertex',async()=>{
 const gltf=await loadModel(),clips=new Map(gltf.animations.map(clip=>[clip.name,clip]));
 const rig=createCat3DRigInstance(gltf.scene,clips,normalizeCat3DCalibration(),{id:'eyes',presetId:'persian'});
 const eyes=rig.eyes.filter(({mesh})=>mesh.morphTargetDictionary.EyeSize!==undefined);
 assert.ok(eyes.length>=4,'export must include the complete eye and lid group');
 const actual=new THREE.Vector3(),closed=new THREE.Vector3(),box=new THREE.Box3();let opened=false;
 for(const closure of [0,.35,.8,1]){
  setCat3DEyelids(rig,closure);rig.pivot.updateMatrixWorld(true);
  for(const {mesh,index}of eyes){
   const cache=rig.boneBounds.find(entry=>entry.mesh===mesh);
   mesh.computeBoundingBox=()=>{throw new Error('eye sizes must use cached dynamic bounds')};
   updateCatBoneBounds(cache,box).expandByScalar(1e-6);
   for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    mesh.getVertexPosition(i,actual).applyMatrix4(mesh.matrixWorld);assert.ok(box.containsPoint(actual));
   }
   const sizeIndex=mesh.morphTargetDictionary.EyeSize,size=mesh.morphTargetInfluences[sizeIndex];
   for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    mesh.getVertexPosition(i,actual);
    mesh.morphTargetInfluences[index]=1;mesh.morphTargetInfluences[sizeIndex]=0;mesh.getVertexPosition(i,closed);
    if(closure===1)assert.ok(actual.distanceTo(closed)<1e-7,'sleep must match the sealed eye shape');
    else opened ||= actual.distanceTo(closed)>.001;
    mesh.morphTargetInfluences[index]=closure;mesh.morphTargetInfluences[sizeIndex]=size;
   }
  }
 }
 assert.ok(opened,'open and closed eyes must have distinct real geometry');disposeCat3DRigInstance(rig);
});

test('all live cats retain separate gait clocks and inactive removal releases only its rig',async()=>{
 const gltf=await loadModel(),renderer=new CatRiggedPilot();renderer.source=gltf.scene;renderer.state='ready';renderer.boneCount=28;renderer.calibration=normalizeCat3DCalibration();renderer.scene=new THREE.Scene();
 renderer.camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);renderer.camera.position.set(0,4,4);renderer.camera.lookAt(0,0,0);renderer.camera.updateMatrixWorld(true);renderer.ambient={intensity:1};renderer.keyLight={intensity:1};
 for(const clip of gltf.animations)renderer.clips.set(clip.name,clip);
 let resizeCount=0;renderer.webgl={domElement:{width:192,height:192},info:{render:{triangles:0,calls:0}},setSize(width,height){resizeCount++;this.domElement.width=width;this.domElement.height=height},render(){},dispose(){},forceContextLoss(){}};
 const a={id:'a',presetId:'ragdoll',active:true,x:.45,y:.55,heading:0,state:'walk',speed:.02},b={id:'b',presetId:'british-shorthair',active:true,x:.6,y:.6,heading:2,state:'idle',speed:0};
 renderer.select([a,b]);const frame=(cat,time,scale=.065)=>renderer.render({cat,preset:{scale},worldScale:1600,pixelRatio:1,time});
 frame(a,0);frame(b,0);a.x+=.001;frame(a,1/60);frame(b,1/60);
 const moving=renderer.instances.get('a'),resting=renderer.instances.get('b');assert.ok(moving.walkPhase>0);assert.equal(resting.walkPhase,0);assert.equal(moving.currentAction,'Walk');assert.equal(resting.currentAction,'Idle');
 const clock=resting.clock;frame(b,1/60);assert.equal(resting.clock,clock,'repeated paused renders must not advance motion');frame(b,30);assert.ok(resting.clock-clock<=.061,'resume clamps elapsed time');
 const previousResizes=resizeCount;for(let i=0;i<5;i++){frame(a,31+i/60,.05);frame(b,31+i/60,.075)}assert.ok(resizeCount-previousResizes<=1,'different body sizes do not continually reallocate one WebGL surface');
 renderer.select([b]);assert.equal(renderer.instances.size,1);assert.equal(moving.actions.size,0);assert.ok(resting.actions.size>0);assert.equal(renderer.supports(a),false);assert.equal(renderer.supports(b),true);
 renderer.dispose();assert.equal(renderer.instances.size,0);assert.equal(renderer.webgl,null);assert.equal(renderer.dead,true);assert.equal(renderer.clips.size,0);
});

test('failed GPU coat compilation cannot leave an apparently ready invisible rig',()=>{
 const renderer=new CatRiggedPilot();renderer.state='ready';renderer.activeIds.add('qa');
 const gl={getProgramInfoLog:()=> 'Fragment shader did not compile.',getShaderInfoLog:shader=>shader==='fragment'?"ERROR: reserved word patch\u0000":''};
 assert.throws(()=>renderer._shaderError(gl,'program','vertex','fragment'),/猫咪材质编译失败.*reserved word patch/);
 assert.equal(renderer.state,'failed');assert.equal(renderer.supports({id:'qa'}),false);assert.equal(renderer.stats().status,'failed');assert.ok(renderer.stats().error.includes('Fragment shader'));assert.ok(!renderer.stats().error.includes('\u0000'));
});

test('one atlas captures independent cats before any 2D composition and crop slots never overlap',async()=>{
 const gltf=await loadModel(),renderer=new CatRiggedPilot();renderer.source=gltf.scene;renderer.state='ready';renderer.boneCount=28;renderer.scene=new THREE.Scene();
 renderer.camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);renderer.camera.position.set(0,4,4);renderer.camera.lookAt(0,0,0);renderer.camera.updateMatrixWorld(true);renderer.ambient={intensity:1};renderer.keyLight={intensity:1};
 for(const clip of gltf.animations)renderer.clips.set(clip.name,clip);
 let submissions=0,resizes=0;const viewports=[];renderer.webgl={domElement:{width:192,height:192},info:{render:{triangles:1,calls:1}},setSize(width,height){resizes++;Object.assign(this.domElement,{width,height})},render(){submissions++},setViewport(...rect){viewports.push(rect)},setScissor(){},setScissorTest(){},dispose(){},forceContextLoss(){}};
 const cats=Array.from({length:4},(_,i)=>({id:String(i),presetId:'ragdoll',active:true,x:.35+i*.08,y:.55,heading:i,state:i?'idle':'walk',speed:i?0:.02}));renderer.select(cats);
 const requests=cats.map(cat=>({cat,preset:{scale:.065},worldScale:1600,pixelRatio:1,time:0}));renderer.prepareBatch(requests);
 assert.equal(submissions,4);assert.equal(resizes,1);const frames=requests.map(request=>renderer.render(request));assert.equal(submissions,4,'composition reads cached atlas instead of interleaving new GPU renders');
 assert.equal(new Set(frames.map(frame=>frame.canvas)).size,1);
 for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const a=frames[i].sourceRect,b=frames[j].sourceRect;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)}
 for(let i=0;i<frames.length;i++){const r=frames[i].sourceRect,v=viewports[i];assert.deepEqual(v,[r.x,renderer.webgl.domElement.height-r.y-r.height,r.width,r.height],'WebGL bottom-left viewport matches top-left canvas crop')}
 renderer.select(cats);renderer.prepareBatch(requests.map(request=>({...request,time:1/60})));assert.equal(resizes,1);renderer.dispose();
});

test('flat-face mouth morphology shifts the visual feeding anchor without moving cat state',()=>{
 const renderer=new CatRiggedPilot();renderer.calibration=normalizeCat3DCalibration({mouthOffset:[.01,.14,-.006],mouthMorphOffsets:{MuzzleShort:[0,-.02,.004]}});
 renderer._project=point=>({x:point.x,y:point.y,z:point.z});
 const mouth=new THREE.Object3D();mouth.position.set(.2,.3,.4);mouth.updateMatrixWorld();
 const instance={mouth,style:{style:{morphs:{MuzzleShort:.8}}}};
 const contact=renderer._mouth(instance,100,{x:0,y:0});
 assert.ok(Math.abs(contact.x-.21)<1e-9);assert.ok(Math.abs(contact.y-(.3+.14-.016))<1e-9);assert.ok(Math.abs(contact.z-(.4-.006+.0032))<1e-9);
 assert.deepEqual(mouth.position.toArray(),[.2,.3,.4]);
});
