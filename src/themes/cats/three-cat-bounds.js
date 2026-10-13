import {Box3,Matrix4,Vector3} from 'three';

// A skinned vertex is a convex weighted sum of bone-transformed positions.
// Build a bind-local enclosure for every bone once. The union of their posed
// boxes encloses every weighted vertex, for any skeleton pose, without CPU
// skinning tens of thousands of vertices in every browser animation frame.
export function buildCatBoneBounds(mesh,{dynamicMorphs=[]}={}){
 const position=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
 const entries=mesh.skeleton.bones.map((bone,index)=>({bone,box:new Box3(),inverse:mesh.skeleton.boneInverses[index]}));
 const point=new Vector3(),base=new Vector3(),delta=new Vector3(),local=new Vector3(),components=['getX','getY','getZ','getW'];let unweighted=false;
 const morphs=mesh.geometry.morphAttributes.position||[],morphWeights=[...(mesh.morphTargetInfluences||[])];
 const dynamicIndices=new Set(dynamicMorphs.map(name=>mesh.morphTargetDictionary?.[name]).filter(index=>index!==undefined));
 for(let i=0;i<position.count;i++){
  base.fromBufferAttribute(position,i);point.copy(base);
  const variants=[];
  for(let index=0;index<morphs.length;index++){
   delta.fromBufferAttribute(morphs[index],i);if(!mesh.geometry.morphTargetsRelative)delta.sub(base);
   if(dynamicIndices.has(index))variants.push(delta.clone());else point.addScaledVector(delta,morphWeights[index]||0);
  }
  // Fixed body morphology is baked once. The two endpoints of an eye-close
  // target enclose every blink without re-skinning vertices each frame.
  const points=[point.clone()];for(const variant of variants){const count=points.length;for(let j=0;j<count;j++)points.push(points[j].clone().add(variant))}
  let total=0;
  for(let j=0;j<4;j++){
   const weight=weights[components[j]](i);if(!(weight>0))continue;total+=weight;
   const entry=entries[indices[components[j]](i)];if(!entry)continue;
   for(const p of points){local.copy(p).applyMatrix4(mesh.bindMatrix).applyMatrix4(entry.inverse);entry.box.expandByPoint(local)}
  }
  if(!total)unweighted=true;
 }
 return {mesh,entries:entries.filter(entry=>!entry.box.isEmpty()),unweighted,morphs:!!morphs.length,morphWeights,dynamicIndices,
  matrix:new Matrix4(),meshTransform:new Matrix4(),point:new Vector3(),fallback:new Box3()};
}

export function visitCatBoneBounds(cache,visit){
 const {mesh,matrix,meshTransform,point}=cache;
 // Appearance edits rebuild this cache; a defensive exact fallback handles
 // external morph changes. Declared blink targets already include [0, 1].
 if(cache.morphs&&mesh.morphTargetInfluences?.some((value,index)=>cache.dynamicIndices.has(index)?value<0||value>1:value!==(cache.morphWeights[index]||0))){
  mesh.computeBoundingBox();const box=mesh.boundingBox;
  for(let i=0;i<8;i++){point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(mesh.matrixWorld);visit(point)}
  return;
 }
 meshTransform.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
 for(const {bone,box}of cache.entries){
  matrix.multiplyMatrices(meshTransform,bone.matrixWorld);
  for(let i=0;i<8;i++){point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(matrix);visit(point)}
 }
 if(cache.unweighted){point.set(0,0,0).applyMatrix4(meshTransform);visit(point)}
}
export function updateCatBoneBounds(cache,target=new Box3()){
 target.makeEmpty();visitCatBoneBounds(cache,point=>target.expandByPoint(point));return target;
}
