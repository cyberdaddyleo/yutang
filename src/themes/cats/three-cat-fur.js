// A small layer of actual skinned fur ribbons. Shared geometry is generated
// once from the continuous body, never once per frame or per individual cat.
const cache=new WeakMap();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const tuple=(attribute,index)=>[attribute.getX(index),attribute.getY(index),attribute.getZ(index)];
const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const scale=(a,s)=>a.map(value=>value*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const normalize=a=>scale(a,1/(length(a)||1));
const mix3=(attribute,ids,bary)=>ids.reduce((p,index,k)=>add(p,tuple(attribute,index),bary[k]),[0,0,0]);
const components=['getX','getY','getZ','getW'];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export function catFurRegion(p){
 const [x,y,z]=p;
 const ruff=smooth(.065,.14,z)*(1-smooth(.245,.275,z))*smooth(.20,.28,y)*(1-smooth(.41,.47,y));
 const cheeks=smooth(.055,.095,Math.abs(x))*smooth(.15,.22,z)*(1-smooth(.46,.50,y));
 const plume=(1-smooth(-.245,-.205,z))*smooth(.28,.35,y);
 return Math.max(ruff,cheeks,plume);
}
function allowed(p,n){
 const [x,y,z]=p;
 if(y<.095)return false; // Soles and lower paws keep their exact floor contact.
 if(y>.49&&z>.12&&Math.abs(x)>.032)return false; // Pinnae/interiors.
 // Protect the actual enlarged eye openings and bare nose/lips, rather than
 // excluding the entire head and leaving a plastic-looking facial mask.
 if(z>.265&&((Math.abs(x)-.054)/.044)**2+((y-.460)/.033)**2<1)return false;
 if(z>.305&&Math.abs(x)<.045&&y<.435)return false;
 if(y<.25&&n[1]<-.20)return false;
 return true;
}
function randomGenerator(){let state=0x7ca74b11;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};}
function boneWeights(geometry,ids,bary){
 const weights=new Map(),skinIndex=geometry.attributes.skinIndex,skinWeight=geometry.attributes.skinWeight;
 for(let i=0;i<3;i++)for(let j=0;j<4;j++){const weight=skinWeight[components[j]](ids[i])*bary[i];if(weight>0){const bone=skinIndex[components[j]](ids[i]);weights.set(bone,(weights.get(bone)||0)+weight)}}
 const best=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=best.reduce((sum,pair)=>sum+pair[1],0)||1;
 while(best.length<4)best.push([0,0]);return {indices:best.map(pair=>pair[0]),weights:best.map(pair=>pair[1]/total)};
}
export function createCatFurGeometry(source,THREE,{tuftCount=1800}={}){
 const position=source.attributes.position,normal=source.attributes.normal,index=source.index,triangles=[],random=randomGenerator();let area=0;
 for(let start=0;start<(index?.count||position.count);start+=3){
  const ids=[0,1,2].map(i=>index?index.getX(start+i):start+i),a=tuple(position,ids[0]),b=tuple(position,ids[1]),c=tuple(position,ids[2]);
  const n=normal?normalize(mix3(normal,ids,[1/3,1/3,1/3])):normalize(cross(add(b,a,-1),add(c,a,-1)));
  const centroid=scale(add(add(a,b),c),1/3),surface=length(cross(add(b,a,-1),add(c,a,-1)))*.5;
  if(surface<1e-10||!allowed(centroid,n))continue;
  area+=surface*(.65+catFurRegion(centroid)*2.4);triangles.push({ids,area,n});
 }
 if(!triangles.length)throw new Error('猫咪毛发缺少可用的蒙皮表面');
 const count=clamp(Math.round(tuftCount),1,2500),positions=[],normals=[],skinIndices=[],skinWeights=[],uvs=[],seeds=[],indices=[],roots=[],regions=[];
 const sourceMorphs=source.morphAttributes.position||[],morphs=sourceMorphs.map(()=>[]),furLength=[];
 for(let strand=0;strand<count;strand++){
  const sample=random()*area;let low=0,high=triangles.length-1;while(low<high){const middle=(low+high)>>1;if(triangles[middle].area<sample)low=middle+1;else high=middle}
  const triangle=triangles[low];let bary,root,n;
  for(let attempt=0;attempt<9;attempt++){const r=Math.sqrt(random()),q=random();bary=attempt===8?[1/3,1/3,1/3]:[1-r,r*(1-q),r*q];root=mix3(position,triangle.ids,bary);n=normal?normalize(mix3(normal,triangle.ids,bary)):triangle.n;if(allowed(root,n))break;}
  // Fur lays along the body/cheeks. A bent narrow ribbon gives a soft edge,
  // rather than a forest of stiff spikes normal to the skin.
  const region=catFurRegion(root),strandSeed=random(),face=root[2]>.24;
  const preferred=root[2]<-.22?[0,.7,-.25]:root[2]>.10?[Math.sign(root[0])*.22,-1,-.30]:[0,-.3,-1];let flow=add(preferred,n,-dot(preferred,n));if(length(flow)<.05)flow=cross(n,[1,0,0]);flow=normalize(flow);
  const sideways=normalize(cross(n,flow)),lengthVariation=.72+random()*.52,width=.0017+random()*.0012+region*.0008;
  // Short visible strokes still need length at the 80–120px game size. Tiny
  // nearly-upright cards collapse to dots; these lie along the groom direction.
  const stem=add(scale(n,.18+region*.16),scale(flow,.98-region*.05));
  const layout=[[-.5,0],[.5,0],[-.12,.62],[.02,1]],weights=boneWeights(source,triangle.ids,bary);
  const changes=sourceMorphs.map(attribute=>{const target=mix3(attribute,triangle.ids,bary);return source.morphTargetsRelative?target:add(target,root,-1)});
  for(let v=0;v<4;v++){
   const [spread,height]=layout[v],offset=add(scale(n,.0018),scale(sideways,spread*width)),p=add(add(root,offset),stem,(face?.004:.009)*lengthVariation*height);
   positions.push(...p);normals.push(...n);roots.push(...root);skinIndices.push(...weights.indices);skinWeights.push(...weights.weights);
   uvs.push(v===0?0:v===1?1:v===2?.12:.52,height);seeds.push(strandSeed);regions.push(region);furLength.push(...scale(stem,(face?.004:.014+region*.017)*lengthVariation*height));
   for(let m=0;m<morphs.length;m++)morphs[m].push(...changes[m]);
  }
  const k=strand*4;indices.push(k,k+1,k+2,k+1,k+3,k+2);
 }
 const geometry=new THREE.BufferGeometry();geometry.name='SharedSkinnedFurTufts';
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('furRoot',new THREE.Float32BufferAttribute(roots,3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));geometry.setAttribute('furUv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('furSeed',new THREE.Float32BufferAttribute(seeds,1));geometry.setAttribute('furRegion',new THREE.Float32BufferAttribute(regions,1));geometry.setIndex(indices);
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[...morphs,furLength].map(values=>new THREE.Float32BufferAttribute(values,3));
 geometry.userData={tuftCount:count,sourceMorphCount:sourceMorphs.length};return geometry;
}
function acquireGeometry(source,THREE){let entry=cache.get(source);if(!entry){entry={geometry:createCatFurGeometry(source,THREE),references:0};cache.set(source,entry)}entry.references++;return entry.geometry;}
function releaseGeometry(source,geometry){const entry=cache.get(source);if(!entry||entry.geometry!==geometry)return;if(--entry.references===0){geometry.dispose();cache.delete(source)}}
function softenMaterial(material,THREE){
 const before=material.onBeforeCompile,programKey=material.customProgramCacheKey?.bind(material);
 material.side=THREE.DoubleSide;material.transparent=true;material.depthWrite=false;material.alphaTest=.01;material.alphaToCoverage=false;material.forceSinglePass=true;material.roughness=1;material.metalness=0;
 material.onBeforeCompile=shader=>{
  before?.(shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n attribute vec2 furUv; attribute vec3 furRoot; attribute float furSeed; attribute float furRegion; varying vec2 vFurUv; varying float vFurSeed; varying vec3 vFurViewNormal; varying float vFurRegion;').replace('#include <begin_vertex>','#include <begin_vertex>\n vFurUv=furUv;vFurSeed=furSeed;vFurRegion=furRegion;').replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\n vFurViewNormal=transformedNormal;');
  // Pigment comes from the root; a cream strand must not turn into a dark
  // stripe merely because its free tip extends beyond the painted patch.
  shader.vertexShader=shader.vertexShader.replace('vCatRest=position;','vCatRest=furRoot;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n varying vec2 vFurUv; varying float vFurSeed; varying vec3 vFurViewNormal; varying float vFurRegion;').replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n #ifdef DOUBLE_SIDED\n normal *= faceDirection; nonPerturbedNormal=normal;\n #endif').replace('#include <alphatest_fragment>',`float furEdge=pow(max(0.0,1.0-abs(vFurUv.x*2.0-1.0)),.65);\n float furTip=1.0-smoothstep(.62,1.0,vFurUv.y);\n float furRim=pow(1.0-abs(normalize(vFurViewNormal).z),1.4);\n diffuseColor.a*=furEdge*furTip*(.46+vFurSeed*.14+vFurRegion*.14)*mix(.29,1.0,furRim);\n #include <alphatest_fragment>`);
 };
 material.customProgramCacheKey=()=>`${programKey?.()||'fur'}:skinned-soft-tufts-v4`;material.needsUpdate=true;return material;
}
export function addCatFur(model,THREE,{fluff=.15,createMaterial}={}){
 let body;model.traverse(object=>{if(!body&&object.isSkinnedMesh&&!object.userData.catFur&&(object.name.includes('Body')||(Array.isArray(object.material)?object.material:[object.material]).some(material=>material?.name.startsWith('Fur'))))body=object});
 if(!body)return {mesh:null,dispose(){}};
 const source=body.geometry,geometry=acquireGeometry(source,THREE),original=Array.isArray(body.material)?body.material[0]:body.material;
 let material;try{material=createMaterial?createMaterial(original):original.clone();if(!createMaterial){material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey.bind(original)}softenMaterial(material,THREE);}catch(error){releaseGeometry(source,geometry);throw error}
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='CourtyardCatFur';mesh.userData.catFur=true;mesh.frustumCulled=false;mesh.bindMode=body.bindMode;mesh.bind(body.skeleton,body.bindMatrix);
 mesh.morphTargetDictionary={...(body.morphTargetDictionary||{}),FurLength:geometry.userData.sourceMorphCount};mesh.morphTargetInfluences=[...(body.morphTargetInfluences||[]),clamp(fluff,0,1)];
 mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);mesh.scale.copy(body.scale);body.parent.add(mesh);
 let disposed=false;return {mesh,dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();material.dispose();releaseGeometry(source,geometry)}};
}
