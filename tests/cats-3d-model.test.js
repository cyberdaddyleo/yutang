import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const asset=new URL('../public/assets/cats/3d/courtyard-cat.glb',import.meta.url);
function readGlb(){
 const bytes=fs.readFileSync(asset);
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 assert.equal(bytes.readUInt32LE(4),2);
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 let json,bin;
 for(let offset=12;offset<bytes.length;){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);if(type===0x4e4f534a)json=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;offset+=8+length;}
 assert.ok(json&&bin);return {json,bin};
}
function values(g,accessorIndex){
 const a=g.json.accessors[accessorIndex],view=g.json.bufferViews[a.bufferView];
 const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},readers={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size=sizes[a.componentType],stride=view.byteStride||size*components;
 assert.ok(readers[a.componentType]);const result=[];
 for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const raw=g.bin[readers[a.componentType]]((view.byteOffset||0)+(a.byteOffset||0)+i*stride+j*size);result.push(a.normalized?raw/(a.componentType===5121?255:65535):raw);}
 return result;
}

test('production courtyard is a real four-foot skinned mesh with normalized finite weights',()=>{
 const g=readGlb(),j=g.json,meta=JSON.parse(fs.readFileSync(new URL('../public/assets/cats/3d/courtyard-cat.json',import.meta.url)));
 assert.ok(j.skins?.length>0,'a mesh without a skin is not a skeletal cat');
 const weighted=j.nodes.filter(n=>n.mesh!==undefined&&n.skin!==undefined);
 assert.ok(weighted.length>0);
 const footNames=Object.values(meta.footBones||{});assert.equal(new Set(footNames).size,4,'four independently named paw bones');
 const jointNames=new Set(j.skins.flatMap(s=>s.joints.map(i=>j.nodes[i].name)));
 for(const name of footNames)assert.ok(jointNames.has(name),`missing paw ${name}`);
 for(const n of weighted)for(const p of j.meshes[n.mesh].primitives){
  assert.ok(p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined);
  const weights=values(g,p.attributes.WEIGHTS_0);for(let i=0;i<weights.length;i+=4){const group=weights.slice(i,i+4);assert.ok(group.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(Math.abs(group.reduce((a,b)=>a+b,0)-1)<.006);}
 }
});

test('production courtyard exports separate locomotion, sleeping, interaction and directional jump clips with finite keyframes',()=>{
 const g=readGlb(),clips=new Map((g.json.animations||[]).map(a=>[a.name,a]));
 for(const name of ['Idle','Walk','HopUp','HopDown','Sleep','Rest','Eat','Groom','Scratch','Pet','Play']){
  const clip=clips.get(name);assert.ok(clip,`missing ${name}`);assert.ok(clip.channels.length>=4);
  for(const s of clip.samplers){const times=values(g,s.input),output=values(g,s.output);assert.ok(times.length>=2);assert.ok(times.every((v,i)=>Number.isFinite(v)&&(!i||v>=times[i-1])));assert.ok(output.every(Number.isFinite));}
 }
 const walk=clips.get('Walk'),targets=new Set(walk.channels.map(c=>c.target.node));assert.ok(targets.size>=8,'walk must animate independent joints, not move the entire cat only');
});


test('production calibration exposes a real mouth anchor and authored breed morphology',()=>{
 const g=readGlb(),meta=JSON.parse(fs.readFileSync(new URL('../public/assets/cats/3d/courtyard-cat.json',import.meta.url)));
 assert.ok(g.json.nodes.some(node=>node.name===meta.mouthBone));assert.ok(Array.isArray(meta.mouthOffset)&&meta.mouthOffset.length===3&&meta.mouthOffset.every(Number.isFinite));
 const names=new Set(g.json.meshes.flatMap(mesh=>mesh.extras?.targetNames||[]));for(const name of ['Build','Fluff','Cheeks','MuzzleShort','EarsLarge','EarsRound','CloseEyes'])assert.ok(names.has(name),`missing ${name}`);
 for(const animation of g.json.animations)for(const sampler of animation.samplers)assert.equal(values(g,sampler.input)[0],0,`${animation.name}: no one-frame footslip from exporter timestamp offset`);
});
