import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {normalizeCat3DCalibration,cat3DAction,cat3DHeading,smoothCat3DYaw,cat3DGroundDistance,cat3DVisualWidth,cat3DStrideAdvance,cat3DClipTime,resolveCat3DClip,sampleCat3DBlend,freezeCat3DRootTrack} from './three-cat-mapping.js';
import {buildCatBoneBounds,visitCatBoneBounds} from './three-cat-bounds.js';
import {applyCat3DAppearance} from './three-cat-appearance.js';

export const CAT_3D_CLIPS=Object.freeze(['Idle','Walk','HopUp','HopDown','Rest','Sleep','Eat','Groom','Scratch','Play','Pet']);
const FOOT_ALIASES={
 frontLeft:['paw_fl','foot_fl','FrontPaw_L','front_foot.L','foot_front.L'],
 frontRight:['paw_fr','foot_fr','FrontPaw_R','front_foot.R','foot_front.R'],
 backLeft:['paw_bl','foot_bl','BackPaw_L','hind_foot.L','foot_back.L'],
 backRight:['paw_br','foot_br','BackPaw_R','hind_foot.R','foot_back.R'],
};
const appearanceKey=cat=>JSON.stringify([cat.presetId,cat.customization,cat.appearance]);
export function setCat3DEyelids(instance,closure){
 const closed=Math.max(0,Math.min(1,closure)),size=instance.style?.style?.morphs?.EyeSize||0;
 for(const {mesh,index}of instance.eyes){
  mesh.morphTargetInfluences[index]=closed;
  const eyeSize=mesh.morphTargetDictionary?.EyeSize;
  // EyeSize opens the complete eye/lid group. Remove that opening while
  // closing so large-eyed breeds can sleep with a fully sealed eyelid.
  if(eyeSize!==undefined)mesh.morphTargetInfluences[eyeSize]=size*(1-closed);
 }
}
function disposeSource(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 root?.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  if(object.skeleton)skeletons.add(object.skeleton);
  for(const material of (Array.isArray(object.material)?object.material:[object.material]).filter(Boolean)){
   materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }
 });
 textures.forEach(texture=>{texture.source?.data?.close?.();texture.dispose()});materials.forEach(material=>material.dispose());geometries.forEach(geometry=>geometry.dispose());skeletons.forEach(skeleton=>skeleton.dispose());
}

// Fixed breed morphs are baked once into deduplicated support points. During
// a lying/waking blend only, evaluate their actual weighted skin positions;
// interpolated quaternions can dip a paw even when both endpoint poses pass.
export function buildCatTransitionSupport(instance){
 const body=instance.meshes.find(mesh=>mesh.name==='CourtyardCatBody')||instance.meshes.find(mesh=>!mesh.userData.catFur),point=new THREE.Vector3();
 const cache={probes:[],probeCount:0,contacts:new Map(),common:new THREE.Matrix4()};if(!body)return cache;
 const si=body.geometry.attributes.skinIndex,sw=body.geometry.attributes.skinWeight,seen=new Set(),positions=[],indices=[],weights=[],feet=[];
 const footNames=new Map(instance.feet.map(foot=>[body.skeleton.bones.indexOf(foot.bone),foot.name]));
 const names=[...new Set(footNames.values())];names.forEach(name=>cache.contacts.set(name,{name,position:new THREE.Vector3(),minY:Infinity}));
 for(let i=0;i<body.geometry.attributes.position.count;i++){
  THREE.Mesh.prototype.getVertexPosition.call(body,i,point);
  const bi=[0,1,2,3].map(j=>si.getComponent(i,j)),bw=[0,1,2,3].map(j=>sw.getComponent(i,j));
  const key=`${point.x},${point.y},${point.z}|${bi}|${bw}`;if(seen.has(key))continue;seen.add(key);
  let foot=-1;for(let j=0;j<4;j++)if(bw[j]>.5&&footNames.has(bi[j]))foot=names.indexOf(footNames.get(bi[j]));
  positions.push(point.x,point.y,point.z);indices.push(...bi);weights.push(...bw);feet.push(foot);
 }
 cache.probeCount=feet.length;cache.probes.push({mesh:body,positions:new Float64Array(positions),indices:new Uint16Array(indices),weights:new Float32Array(weights),feet:new Int8Array(feet),names,matrices:body.skeleton.bones.map(()=>new THREE.Matrix4())});return cache;
}
export function groundCat3DTransition(instance,calibration={groundOffset:0}){
 instance.offset.position.y=calibration.groundOffset||0;instance.pivot.updateMatrixWorld(true);
 const layers=(instance.blendState?.layers||[]).filter(layer=>layer.weight>1e-7),active=layers.length>1&&layers.some(layer=>/^(Sleep|Rest)/.test(layer.name));
 if(!active){instance.grounding={active:false,lift:0,probeCount:0,minSkinY:null};return instance.grounding;}
 const started=performance.now(),cache=instance.transitionSupport||(instance.transitionSupport=buildCatTransitionSupport(instance));
 for(const contact of cache.contacts.values())contact.minY=Infinity;
 let minimum=Infinity;
 for(const probe of cache.probes){
  const {mesh,positions,indices,weights,feet,matrices,names}=probe;
  cache.common.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
  for(let b=0;b<matrices.length;b++)matrices[b].multiplyMatrices(cache.common,mesh.skeleton.bones[b].matrixWorld).multiply(mesh.skeleton.boneInverses[b]).multiply(mesh.bindMatrix);
  for(let i=0;i<feet.length;i++){
   const p=i*3,k=i*4,x=positions[p],y=positions[p+1],z=positions[p+2];let skinY=0;
   for(let j=0;j<4;j++){const w=weights[k+j];if(!w)continue;const m=matrices[indices[k+j]].elements;skinY+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);}
   minimum=Math.min(minimum,skinY);
   const contact=feet[i]<0?null:cache.contacts.get(names[feet[i]]);
   if(contact&&skinY<contact.minY){let skinX=0,skinZ=0;for(let j=0;j<4;j++){const w=weights[k+j];if(!w)continue;const m=matrices[indices[k+j]].elements;skinX+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);skinZ+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);}contact.minY=skinY;contact.position.set(skinX,skinY,skinZ);}
  }
 }
 const lift=Number.isFinite(minimum)?Math.max(0,-minimum):0;
 if(lift){instance.offset.position.y+=lift;instance.pivot.updateMatrixWorld(true);}
 for(const contact of cache.contacts.values()){contact.minY+=lift;contact.position.y+=lift;}
 instance.grounding={active:true,lift,probeCount:cache.probeCount,minSkinY:Number.isFinite(minimum)?minimum+lift:null,cpuMs:performance.now()-started};return instance.grounding;
}

// Geometry and animation clips are shared. Bones, action weights, morphology
// and materials belong to one cat; two cats can eat and sleep independently.
export function createCat3DRigInstance(source,clips,calibration,cat,{style=applyCat3DAppearance,preset={}}={}){
 const model=cloneSkeleton(source),pivot=new THREE.Group(),offset=new THREE.Group();offset.add(model);pivot.add(offset);
 offset.position.set(-calibration.centerX,calibration.groundOffset,-calibration.centerZ);
 const instance={id:cat.id,model,pivot,offset,mixer:new THREE.AnimationMixer(model),actions:new Map(),meshes:[],feet:[],eyes:[],previous:null,walkPhase:0,yaw:null,currentAction:null,blendState:null,clock:0,actionAge:0,feedingOffset:{x:0,y:0}};
 instance.style=style(model,cat,preset,THREE);instance.appearanceKey=appearanceKey(cat);
 model.traverse(object=>{if(object.isSkinnedMesh){object.frustumCulled=false;instance.meshes.push(object)}const index=object.morphTargetDictionary?.CloseEyes;if(index!==undefined)instance.eyes.push({mesh:object,index})});
 for(const [name,clip]of clips){const action=instance.mixer.clipAction(clip);action.play();action.paused=true;action.setEffectiveWeight(0);instance.actions.set(name,action)}
 for(const [name,aliases]of Object.entries(FOOT_ALIASES)){
  const specified=calibration.footBones[name]||calibration.footBones[name.replace('back','hind')],names=typeof specified==='string'?[specified]:aliases;
  const bone=names.map(id=>model.getObjectByName(id)).find(Boolean);if(bone)instance.feet.push({name,bone});
 }
 instance.mouth=calibration.mouthBone?model.getObjectByName(calibration.mouthBone):null;
 instance.boneBounds=instance.meshes.map(mesh=>buildCatBoneBounds(mesh,{dynamicMorphs:['CloseEyes','EyeSize']}));
 // Prepare support while the cat is loading, not on its first visible lie-down.
 instance.transitionSupport=buildCatTransitionSupport(instance);
 return instance;
}
export function disposeCat3DRigInstance(instance){
 if(!instance)return;instance.mixer.stopAllAction();instance.mixer.uncacheRoot(instance.model);instance.style?.dispose?.();
 const skeletons=new Set();instance.model.traverse(object=>{if(object.skeleton)skeletons.add(object.skeleton)});skeletons.forEach(skeleton=>skeleton.dispose());
 instance.pivot.removeFromParent();instance.actions.clear();instance.boneBounds=[];
}

// One WebGL context, no RAF/timers/listeners. The courtyard's existing loop
// submits each cat at its ordinary depth slot then composites this canvas.
export class CatRiggedCourtyard {
 constructor({baseUrl,onChange=()=>{}}={}){
  this.baseUrl=baseUrl;this.onChange=onChange;this.state='loading';this.error=null;this.dead=false;this.selectedId=null;
  this.calibration=normalizeCat3DCalibration();this.clips=new Map();this.instances=new Map();this.activeIds=new Set();this.preparedFrames=new Map();
  this.projection=new THREE.Vector3();this.footVector=new THREE.Vector3();this.mouthVector=new THREE.Vector3();
 }
 async load(){
  try{
   const response=await fetch(`${this.baseUrl}courtyard-cat.json`);if(!response.ok)throw new Error('猫咪骨骼校准文件未载入');
   const metadata=await response.json();if(this.dead)return;this.calibration=normalizeCat3DCalibration(metadata);
   const gltf=await new GLTFLoader().loadAsync(`${this.baseUrl}courtyard-cat.glb`);
   if(this.dead){disposeSource(gltf.scene);return}
   this.source=gltf.scene;const boneNames=new Set(),meshes=[];
   this.source.traverse(object=>{if(object.isSkinnedMesh){meshes.push(object);for(const bone of object.skeleton.bones)boneNames.add(bone.name)}});
   this.boneCount=boneNames.size;if(!meshes.length||this.boneCount<12)throw new Error('猫咪模型没有完整的四足蒙皮骨架');
   const roots=new Set(this.calibration.rootMotionNodes);if(this.source.name)roots.add(this.source.name);
   for(const child of this.source.children)if(!child.isBone&&child.name)roots.add(child.name);
   for(const clip of gltf.animations){
    const canonical=[...CAT_3D_CLIPS,'SleepPlush','RestPlush'].find(name=>(this.calibration.clipNames[name]||name).toLowerCase()===clip.name.toLowerCase());
    if(!canonical||clip.duration<=0)continue;
    const safe=clip.clone();safe.tracks=safe.tracks.map(track=>freezeCat3DRootTrack(track,[...roots]));this.clips.set(canonical,safe);
   }
   const missing=CAT_3D_CLIPS.filter(name=>!this.clips.has(name));if(missing.length)throw new Error(`猫咪缺少骨骼动作：${missing.join('、')}`);
   this._setupRenderer();this.state='ready';this.onChange();
  }catch(error){if(this.dead)return;this.error=String(error?.message||error);this.state='failed';this._disposeResources();this.onChange()}
 }
 _shaderError(gl,program,vertex,fragment){
  const details=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join(' ').replace(/\0/g,'').trim();
  this.error=`猫咪材质编译失败${details?`：${details.slice(0,1200)}`:''}`;this.state='failed';
  // Three otherwise logs a compilation failure and keeps drawing only the
  // eye meshes. Fail the complete rig so the scene can restore visible art.
  throw new Error(this.error);
 }
 _setupRenderer(){
  const cal=this.calibration;
  this.webgl=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'low-power'});
  this.webgl.debug.checkShaderErrors=true;
  this.webgl.debug.onShaderError=(gl,program,vertex,fragment)=>this._shaderError(gl,program,vertex,fragment);
  this.webgl.setClearColor(0x000000,0);this.webgl.setPixelRatio(1);this.webgl.outputColorSpace=THREE.SRGBColorSpace;this.webgl.toneMapping=THREE.NoToneMapping;
  this.scene=new THREE.Scene();this.scene.matrixWorldAutoUpdate=false;this.ambient=new THREE.HemisphereLight(0xfff8ec,0x7c8874,1.7);this.keyLight=new THREE.DirectionalLight(0xfff4df,1.55);
  this.keyLight.position.set(-3,5,4);this.scene.add(this.ambient,this.keyLight);
  this.span=cal.modelLength*cal.viewSpan;
  this.camera=new THREE.OrthographicCamera(-this.span/2,this.span/2,this.span*cal.anchorY,-this.span*(1-cal.anchorY),.01,30);
  const elevation=cal.cameraElevationDegrees*Math.PI/180;this.camera.position.set(0,Math.sin(elevation)*5,Math.cos(elevation)*5);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);
 }
 select(cats){
  this.preparedFrames.clear();this.preparedTime=null;
  this.activeIds=new Set(cats.filter(cat=>cat.active).map(cat=>cat.id));this.selectedId=this.activeIds.values().next().value||null;
  for(const [id,instance]of this.instances)if(!this.activeIds.has(id)){disposeCat3DRigInstance(instance);this.instances.delete(id);if(this.visibleInstance===instance)this.visibleInstance=null}
 }
 supports(cat){return !this.dead&&this.state==='ready'&&this.activeIds.has(cat.id);}
 _instance(cat,preset){
  let instance=this.instances.get(cat.id);
  if(!instance){instance=createCat3DRigInstance(this.source,this.clips,this.calibration,cat,{preset});this.instances.set(cat.id,instance);instance.pivot.visible=false;this.scene.add(instance.pivot)}
  else if(instance.appearanceKey!==appearanceKey(cat)){
   instance.style?.dispose?.();instance.transitionSupport=null;instance.style=applyCat3DAppearance(instance.model,cat,preset,THREE);instance.appearanceKey=appearanceKey(cat);
   instance.meshes=[];instance.eyes=[];instance.model.traverse(object=>{if(object.isSkinnedMesh){object.frustumCulled=false;instance.meshes.push(object)}const index=object.morphTargetDictionary?.CloseEyes;if(index!==undefined)instance.eyes.push({mesh:object,index})});
   instance.boneBounds=instance.meshes.map(mesh=>buildCatBoneBounds(mesh,{dynamicMorphs:['CloseEyes','EyeSize']}));
   instance.transitionSupport=buildCatTransitionSupport(instance);
  }
  return instance;
 }
 prepareBatch(requests){
  this.preparedFrames.clear();this.preparedTime=requests[0]?.time??null;
  if(!requests.length||this.state!=='ready')return;
  const columns=Math.ceil(Math.sqrt(requests.length)),rows=Math.ceil(requests.length/columns);
  const tileSize=Math.min(640,Math.max(192,...requests.map(({cat,preset,worldScale,pixelRatio=1})=>Math.ceil(cat3DVisualWidth(cat,preset)*worldScale*this.calibration.viewSpan*this.calibration.scale*Math.max(1,pixelRatio)/64)*64)));
  const width=columns*tileSize,height=rows*tileSize;
  if(this.webgl.domElement.width!==width||this.webgl.domElement.height!==height)this.webgl.setSize(width,height,false);
  this.webgl.setScissorTest(true);
  try{
   for(let index=0;index<requests.length;index++){
    const x=index%columns*tileSize,y=Math.floor(index/columns)*tileSize;
    this.batchSlot={x,y,size:tileSize};
    this.webgl.setViewport(x,height-y-tileSize,tileSize,tileSize);this.webgl.setScissor(x,height-y-tileSize,tileSize,tileSize);
    const frame=this._renderNow(requests[index]);if(frame)this.preparedFrames.set(requests[index].cat.id,frame);
   }
  }finally{this.batchSlot=null;this.webgl?.setScissorTest(false);}
 }
 render(request){
  if(this.preparedTime===request.time&&this.preparedFrames.has(request.cat.id))return this.preparedFrames.get(request.cat.id);
  return this._renderNow(request);
 }
 _renderNow({cat,preset,worldScale,pixelRatio=1,time=0,light={brightness:1},reducedMotion=false,foodTarget=null}){
  if(!this.supports(cat))return null;const started=performance.now(),cal=this.calibration,instance=this._instance(cat,preset),previous=instance.previous;
  const dt=previous?Math.max(0,Math.min(.06,time-previous.time)):0,distance=previous?cat3DGroundDistance(previous,cat,cal.cameraElevationDegrees):0;
  instance.previous={x:cat.x,y:cat.y,time};instance.clock+=dt*(reducedMotion?.35:1);
  const requestedAction=cat3DAction(cat),request=resolveCat3DClip(requestedAction,this.clips,instance.style?.style),actionName=request.clip;instance.lastRequest=request;this.lastRequest=request;
  if(!actionName)return null;
  const visualWidth=cat3DVisualWidth(cat,preset);
  if(actionName==='Walk')instance.walkPhase+=cat3DStrideAdvance(distance,visualWidth,cal);
  const targetYaw=cat3DHeading(cat.heading,cal.cameraElevationDegrees);
  instance.yaw=smoothCat3DYaw(instance.yaw,targetYaw,dt);instance.pivot.rotation.y=instance.yaw+cal.rotationYDegrees*Math.PI/180;
  instance.actionAge=instance.currentAction===actionName?instance.actionAge+dt:0;
  const clipTime=cat3DClipTime(requestedAction,cat,this.clips.get(actionName).duration,{walkPhase:instance.walkPhase,time:instance.clock+(cat.phase||0),actionAge:instance.actionAge,calibration:cal});
  const blendDuration=requestedAction==='Sleep'?.7:requestedAction==='Rest'||/^(Sleep|Rest)/.test(instance.currentAction)?.45:['HopUp','HopDown'].includes(actionName)?.075:.16;
  instance.blendState=sampleCat3DBlend(instance.blendState,{action:actionName,clipTime,time,duration:blendDuration});instance.currentAction=actionName;
  for(const action of instance.actions.values())action.setEffectiveWeight(0);
  for(const layer of instance.blendState.layers){const action=instance.actions.get(layer.name);action.setEffectiveWeight(layer.weight);action.time=layer.time}
  instance.mixer.update(0);
  const blinkPhase=(instance.clock+(cat.phase||0))%4.7,blink=blinkPhase>4.5?Math.sin((blinkPhase-4.5)/.2*Math.PI):0;
  const eyes=requestedAction==='Sleep'?1:requestedAction==='Pet'?.8:requestedAction==='Groom'?.45:requestedAction==='Rest'?Math.max(.2,blink):blink;
  setCat3DEyelids(instance,eyes);
  if(this.visibleInstance&&this.visibleInstance!==instance)this.visibleInstance.pivot.visible=false;
  instance.pivot.visible=true;this.visibleInstance=instance;groundCat3DTransition(instance,cal);
  this.ambient.intensity=1.7*(light.brightness??1);this.keyLight.intensity=1.55*(light.brightness??1);
  const cssSize=visualWidth*worldScale*cal.viewSpan*cal.scale;
  // A grow-only shared buffer avoids reallocating a GPU surface for each
  // differently sized cat during the same frame.
  const desiredSize=Math.min(640,Math.max(192,Math.ceil(cssSize*Math.max(1,pixelRatio)/64)*64));
  if(!this.batchSlot){if(this.webgl.domElement.width<desiredSize||this.webgl.domElement.height!==this.webgl.domElement.width)this.webgl.setSize(desiredSize,desiredSize,false);this.webgl.setViewport?.(0,0,this.webgl.domElement.width,this.webgl.domElement.height);}
  this.webgl.render(this.scene,this.camera);
  const anchor={x:cssSize*.5,y:cssSize*cal.anchorY},boundsStarted=performance.now(),bounds=this._bounds(instance,cssSize,anchor),contacts=this._contacts(instance,cssSize,anchor),mouth=this._mouth(instance,cssSize,anchor);
  const feeding=actionName==='Eat'&&mouth&&foodTarget,desiredOffset=feeding?{x:foodTarget.x-mouth.x,y:foodTarget.y-mouth.y}:{x:0,y:0};
  // Existing interaction docks are preserved. The visual settle aligns the
  // lowered muzzle with that dock; navigation and saved positions never move.
  const maxOffset=visualWidth*worldScale*.5,blend=1-Math.exp(-dt*12);
  for(const axis of ['x','y'])instance.feedingOffset[axis]+=(Math.max(-maxOffset,Math.min(maxOffset,desiredOffset[axis]))-instance.feedingOffset[axis])*blend;
  const finished=performance.now(),frames=(this.metrics?.frames||0)+1;
  this.metrics={frames,cpuMs:this.metrics?this.metrics.cpuMs*.95+(finished-started)*.05:finished-started,boundsMs:this.metrics?this.metrics.boundsMs*.95+(finished-boundsStarted)*.05:finished-boundsStarted,triangles:this.webgl.info.render.triangles,drawCalls:this.webgl.info.render.calls,textureSize:this.batchSlot?.size||this.webgl.domElement.width,atlasWidth:this.webgl.domElement.width,atlasHeight:this.webgl.domElement.height,instances:this.instances.size,contexts:1};
  instance.frame={clip:actionName,phase:actionName==='Walk'?instance.walkPhase%1:cat.traverse?.progress||0,yaw:instance.yaw,grounding:instance.grounding,...request};
  return {canvas:this.webgl.domElement,sourceRect:this.batchSlot?{x:this.batchSlot.x,y:this.batchSlot.y,width:this.batchSlot.size,height:this.batchSlot.size}:null,cssSize,anchor,bounds,contacts,mouth,offset:{...instance.feedingOffset},boneCount:this.boneCount,...instance.frame};
 }
 _project(vector,cssSize,anchor){this.projection.copy(vector).project(this.camera);return {x:(this.projection.x*.5+.5)*cssSize-anchor.x,y:(-.5*this.projection.y+.5)*cssSize-anchor.y};}
 _bounds(instance,cssSize,anchor){
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const cache of instance.boneBounds)visitCatBoneBounds(cache,corner=>{const p=this._project(corner,cssSize,anchor);left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y)});
  return {x:left-2,y:top-2,w:right-left+4,h:bottom-top+4};
 }
 _contacts(instance,cssSize,anchor){return instance.feet.map(({name,bone})=>{
  const support=instance.grounding?.active?instance.transitionSupport?.contacts.get(name):null;
  if(support&&Number.isFinite(support.minY))this.footVector.copy(support.position);else bone.getWorldPosition(this.footVector);const p=this._project(this.footVector,cssSize,anchor),height=this.footVector.y;this.footVector.y=0;const ground=this._project(this.footVector,cssSize,anchor);
  return {name,x:p.x,y:p.y,groundX:ground.x,groundY:ground.y,lift:Math.max(0,height)/this.calibration.modelLength,planted:height<.025};
 });}
 _mouth(instance,cssSize,anchor){if(!instance.mouth)return null;const p=this.calibration.mouthOffset;this.mouthVector.set(p.x,p.y,p.z);for(const [name,offset]of Object.entries(this.calibration.mouthMorphOffsets||{})){const weight=instance.style?.style?.morphs?.[name]||0;this.mouthVector.x+=offset.x*weight;this.mouthVector.y+=offset.y*weight;this.mouthVector.z+=offset.z*weight;}instance.mouth.localToWorld(this.mouthVector);return this._project(this.mouthVector,cssSize,anchor);}
 stats(){return {enabled:true,scope:'all-cats',...this.lastRequest,status:this.state,error:this.error,selectedId:this.selectedId,model:'assets/cats/3d/courtyard-cat.glb',boneCount:this.boneCount||0,clips:[...this.clips.keys()],missingClips:CAT_3D_CLIPS.filter(name=>!this.clips.has(name)),instances:this.instances.size,cats:[...this.instances.values()].map(instance=>({id:instance.id,...instance.frame,footBones:instance.feet.map(foot=>foot.bone.name)})),footBones:[...this.instances.values()][0]?.feet.map(foot=>foot.bone.name)||[],metrics:this.metrics||null};}
 _disposeResources(){
  for(const instance of this.instances.values())disposeCat3DRigInstance(instance);this.instances.clear();this.preparedFrames.clear();this.visibleInstance=null;
  disposeSource(this.source);this.source=null;this.scene?.clear();this.webgl?.dispose();this.webgl?.forceContextLoss();this.webgl=null;
 }
 dispose(){this.dead=true;this._disposeResources();this.clips.clear();this.activeIds.clear();this.onChange=()=>{};}
}
// Kept for developer QA clients that inspected the pilot adapter by class name.
export {CatRiggedCourtyard as CatRiggedPilot};
