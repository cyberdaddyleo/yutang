import fs from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'../../..');
const THREE=await import(pathToFileURL(project+'/node_modules/three/build/three.module.js'));
const {GLTFLoader}=await import(pathToFileURL(project+'/node_modules/three/examples/jsm/loaders/GLTFLoader.js'));
const bytes=await fs.readFile(project+'/public/assets/cats/3d/courtyard-cat.glb');
let json,bin;
for(let offset=12;offset<bytes.length;){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);if(type===0x4e4f534a)json=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;offset+=8+length;}
// Material-free copy only for CPU skinning checks; original file is unchanged.
for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;
delete json.images;delete json.textures;delete json.materials;
json.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
globalThis.ProgressEvent=class{constructor(type,data){this.type=type;Object.assign(this,data)}};
const model=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
const mixer=new THREE.AnimationMixer(model.scene),meshes=[];
model.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
const manifest=JSON.parse(await fs.readFile(project+'/public/assets/cats/3d/courtyard-cat.json'));
function pose(action,t){action.time=t;mixer.update(0);model.scene.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update()}
let action=mixer.clipAction(model.animations.find(a=>a.name==='Idle')).play();action.paused=true;pose(action,0);
const phases={frontLeft:.75,frontRight:.25,hindLeft:0,hindRight:.5},soles={};
const vertex=new THREE.Vector3();
for(const [name,boneName] of Object.entries(manifest.footBones)){
 const points=[];
 for(const mesh of meshes){const index=mesh.skeleton.bones.findIndex(b=>b.name===boneName);if(index<0)continue;
  const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
  for(let i=0;i<si.count;i++){let influence=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===index)influence+=sw.getComponent(i,k);
   if(influence>.5){mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);points.push({mesh,index:i,y:vertex.y});}
  }
 }
 const minY=Math.min(...points.map(p=>p.y));soles[name]=points.filter(p=>p.y<minY+.002);
}
mixer.stopAllAction();const clip=model.animations.find(a=>a.name==='Walk');action=mixer.clipAction(clip).play();action.paused=true;
const contact=Object.fromEntries(Object.keys(soles).map(name=>[name,[]]));
for(let i=0;i<=144;i++){
 const t=i/144;pose(action,t*clip.duration);
 for(const name of Object.keys(soles)){
  const phase=(t+phases[name])%1;if(phase>=manifest.stanceFraction)continue;
  const points=soles[name].map(p=>p.mesh.getVertexPosition(p.index,new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld));
  contact[name].push({t,phase,minY:Math.min(...points.map(p=>p.y)),meanZ:points.reduce((sum,p)=>sum+p.z,0)/points.length+manifest.walkStride*t});
 }
}
const result={animationNames:model.animations.map(a=>a.name),vertices:meshes.reduce((s,m)=>s+m.geometry.attributes.position.count,0),contacts:{}};
for(const [name,rows] of Object.entries(contact)){
 const runs=[];for(const row of rows){if(!runs.length||row.t-runs.at(-1).at(-1).t>.008||row.phase<runs.at(-1).at(-1).phase)runs.push([]);runs.at(-1).push(row)}
 result.contacts[name]={soleVertices:soles[name].length,minYRange:[Math.min(...rows.map(r=>r.minY)),Math.max(...rows.map(r=>r.minY))],maxWorldSlipZ:Math.max(...runs.map(run=>Math.max(...run.map(r=>r.meanZ))-Math.min(...run.map(r=>r.meanZ))))};
}
await fs.writeFile(here+'/courtyard-export-contact-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

for(const row of Object.values(result.contacts)){if(row.maxWorldSlipZ>.001||row.minYRange[0]<-.001||row.minYRange[1]>.001)throw new Error('Exported stance support check failed');}

// Exercise the actual production breed morphs on the exported skin. Plush
// resting actions keep paws planted while making room for thicker body/fur.
const {CAT_3D_STYLES,getCat3DAppearance}=await import(pathToFileURL(project+'/src/themes/cats/three-cat-appearance.js'));
const body=meshes.find(mesh=>mesh.name==='CourtyardCatBody');
if(!body)throw new Error('No production body');
const variants={};
for(const preset of Object.keys(CAT_3D_STYLES))for(const build of [1,1.25]){
 const style=getCat3DAppearance(preset,{build}),label=preset+(build===1?'':':max-build');
 for(const mesh of meshes){if(!mesh.morphTargetDictionary)continue;for(const [name,index]of Object.entries(mesh.morphTargetDictionary))mesh.morphTargetInfluences[index]=style.morphs[name]||0;}
 variants[label]={};
 for(const semantic of ['Sleep','Rest','Walk','Eat']){
  const actionName=['Sleep','Rest'].includes(semantic)&&(style.fluff>.6||style.morphs.Build>.65)?semantic+'Plush':semantic;
  mixer.stopAllAction();const clip=model.animations.find(a=>a.name===actionName);if(!clip)throw new Error('Missing '+actionName);
  const played=mixer.clipAction(clip).play();played.paused=true;let minY=Infinity;
  for(const phase of [0,.25,.5,.75]){
   pose(played,phase*clip.duration);
   for(let i=0;i<body.geometry.attributes.position.count;i++){body.getVertexPosition(i,vertex).applyMatrix4(body.matrixWorld);minY=Math.min(minY,vertex.y);}
  }
  variants[label][semantic]={clip:actionName,minBodyY:minY};
 }
}
await fs.writeFile(here+'/courtyard-export-morph-check.json',JSON.stringify({variants},null,2));
const violations=Object.entries(variants).flatMap(([preset,rows])=>Object.entries(rows).filter(([,v])=>v.minBodyY<-.002).map(([action,v])=>({preset,action,...v})));
console.log('EXPORTED_MORPH_SUPPORT',JSON.stringify({cases:Object.keys(variants).length*4,violations}));
if(violations.length)throw new Error('Morph support penetration exceeds 2 mm');

// A pose can be individually grounded while a quaternion blend of folded
// legs passes below the floor. Exercise the production transition helper on
// actual final GLB skin, with all breed morphs; no authored-frame shortcut.
const {groundCat3DTransition}=await import(pathToFileURL(project+'/src/themes/cats/three-cat-renderer.js'));
const {normalizeCat3DCalibration}=await import(pathToFileURL(project+'/src/themes/cats/three-cat-mapping.js'));
const calibration=normalizeCat3DCalibration(manifest),pivot=new THREE.Group(),offset=new THREE.Group();
offset.add(model.scene);pivot.add(offset);
offset.position.set(-calibration.centerX,calibration.groundOffset,-calibration.centerZ);
const instance={model:model.scene,meshes,offset,pivot,feet:Object.entries(manifest.footBones).map(([name,bone])=>({name,bone:model.scene.getObjectByName(bone)})).filter(foot=>foot.bone)};
const transitions=[];
for(const preset of Object.keys(CAT_3D_STYLES))for(const build of [1,1.25]){
 const style=getCat3DAppearance(preset,{build}),plush=style.fluff>.6||style.morphs.Build>.65;
 for(const mesh of meshes){if(!mesh.morphTargetDictionary)continue;for(const [name,index]of Object.entries(mesh.morphTargetDictionary))mesh.morphTargetInfluences[index]=style.morphs[name]||0;}
 instance.transitionSupport=null;
 const sleep=plush?'SleepPlush':'Sleep',rest=plush?'RestPlush':'Rest';
 for(const [from,to]of [['Idle',sleep],[rest,sleep],[sleep,'Idle'],[sleep,rest]]){
  let minBodyY=Infinity,maxLift=0,probeCount=0,activeSamples=0;
  mixer.stopAllAction();const ca=model.animations.find(c=>c.name===from),cb=model.animations.find(c=>c.name===to);
  const aa=mixer.clipAction(ca).play(),ab=mixer.clipAction(cb).play();aa.paused=ab.paused=true;aa.time=ca.duration*.25;ab.time=cb.duration*.25;
  for(const alpha of [0,.1,.25,.5,.75,.9,1]){
   aa.setEffectiveWeight(1-alpha);ab.setEffectiveWeight(alpha);mixer.update(0);
   instance.blendState={layers:[{name:from,weight:1-alpha},{name:to,weight:alpha}]};
   const grounded=groundCat3DTransition(instance,calibration);maxLift=Math.max(maxLift,grounded.lift);probeCount=Math.max(probeCount,grounded.probeCount);if(grounded.active)activeSamples++;
   for(const mesh of meshes)mesh.skeleton.update();
   let phaseMin=Infinity;
   for(let i=0;i<body.geometry.attributes.position.count;i++){body.getVertexPosition(i,vertex).applyMatrix4(body.matrixWorld);phaseMin=Math.min(phaseMin,vertex.y);}
   minBodyY=Math.min(minBodyY,phaseMin);
   if(grounded.active&&phaseMin<-.00001)throw new Error(`Grounded transition penetrated: ${preset} ${from}->${to} ${alpha}: ${phaseMin}`);
   if(!grounded.active&&grounded.lift!==0)throw new Error('Ground correction remained after transition');
  }
  transitions.push({preset,build,from,to,minBodyY,maxLift,probeCount,activeSamples});
 }
}
await fs.writeFile(here+'/courtyard-export-transition-check.json',JSON.stringify({transitions},null,2));
const transitionViolations=transitions.filter(row=>row.minBodyY<-.002||row.maxLift>.04);
console.log('EXPORTED_TRANSITION_SUPPORT',JSON.stringify({cases:transitions.length,samples:transitions.length*7,maxLift:Math.max(...transitions.map(row=>row.maxLift)),violations:transitionViolations}));
if(transitionViolations.length)throw new Error('Exported blend grounding failed');

// Verify face morphs against final geometry, not just the setting values:
// enlarged eyes must close, and short muzzles must follow the saved food dock.
const {setCat3DEyelids}=await import(pathToFileURL(project+'/src/themes/cats/three-cat-renderer.js'));
instance.eyes=meshes.filter(mesh=>mesh.morphTargetDictionary?.CloseEyes!==undefined).map(mesh=>({mesh,index:mesh.morphTargetDictionary.CloseEyes}));
const head=model.scene.getObjectByName(manifest.mouthBone),nose=meshes.find(mesh=>mesh.name==='Nose');
if(!head||!nose)throw new Error('Missing mouth calibration geometry');
function localVertices(mesh){
 const inverse=head.matrixWorld.clone().invert(),points=[];
 for(let i=0;i<mesh.geometry.attributes.position.count;i++)points.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
 return points;
}
function centroid(mesh){const points=localVertices(mesh);return points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);}
function poseFace(){mixer.update(0);pivot.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();}
mixer.stopAllAction();offset.position.y=calibration.groundOffset;const eat=mixer.clipAction(model.animations.find(clip=>clip.name==='Eat')).play();eat.paused=true;eat.time=.7;
for(const mesh of meshes)if(mesh.morphTargetInfluences)mesh.morphTargetInfluences.fill(0);poseFace();
const noseBase=centroid(nose),faceChecks=[];
for(const preset of Object.keys(CAT_3D_STYLES)){
 const style=getCat3DAppearance(preset,{});instance.style={style};
 for(const mesh of meshes){if(!mesh.morphTargetDictionary)continue;for(const [name,index]of Object.entries(mesh.morphTargetDictionary))mesh.morphTargetInfluences[index]=style.morphs[name]||0;}
 setCat3DEyelids(instance,0);poseFace();
 const open={};for(const {mesh}of instance.eyes){const z=localVertices(mesh).map(p=>p.z);open[mesh.name]=Math.max(...z)-Math.min(...z);}
 setCat3DEyelids(instance,1);poseFace();let maxClosedRatio=0;
 for(const {mesh}of instance.eyes){const z=localVertices(mesh).map(p=>p.z),ratio=(Math.max(...z)-Math.min(...z))/open[mesh.name];maxClosedRatio=Math.max(maxClosedRatio,ratio);if(mesh.morphTargetDictionary.EyeSize!==undefined&&mesh.morphTargetInfluences[mesh.morphTargetDictionary.EyeSize]!==0)throw new Error('EyeSize remains open while asleep');}
 const predicted=noseBase.clone();for(const [name,delta]of Object.entries(manifest.mouthMorphOffsets||{}))predicted.addScaledVector(new THREE.Vector3(...delta),style.morphs[name]||0);
 const mouthMorphError=centroid(nose).distanceTo(predicted);faceChecks.push({preset,eyeSize:style.morphs.EyeSize,maxClosedRatio,mouthMorphError});
 if(maxClosedRatio>.08||mouthMorphError>.00005)throw new Error('Exported face closure or food contact calibration failed: '+preset);
}
await fs.writeFile(here+'/courtyard-export-face-check.json',JSON.stringify({faceChecks},null,2));
console.log('EXPORTED_FACE_CHECK',JSON.stringify({cases:faceChecks.length,maxClosedRatio:Math.max(...faceChecks.map(row=>row.maxClosedRatio)),maxMouthMorphError:Math.max(...faceChecks.map(row=>row.mouthMorphError))}));
