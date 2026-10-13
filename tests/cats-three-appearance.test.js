import test from 'node:test';
import assert from 'node:assert/strict';
import {CAT_PRESETS} from '../src/themes/cats/catalog.js';
import {CAT_3D_STYLES,getCat3DAppearance,cat3DAppearanceSignature} from '../src/themes/cats/three-cat-appearance.js';

test('every existing cat has its own finite production coat and morphology',()=>{
 assert.equal(CAT_PRESETS.length,16);
 const signatures=new Set();
 for(const preset of CAT_PRESETS){
  assert.ok(CAT_3D_STYLES[preset.id],preset.id);
  const style=getCat3DAppearance(preset.id);
  signatures.add(JSON.stringify([style.base,style.mark,style.dark,style.mode,style.morphs]));
  for(const color of [style.base,style.mark,style.dark,style.eyeColor])assert.match(color,/^#[a-f0-9]{6}$/i);
  for(const [morph,value]of Object.entries(style.morphs))assert.ok(Number.isFinite(value)&&Math.abs(value)<=1,`${preset.id} ${morph}: ${value}`);
 }
 assert.equal(signatures.size,16,'do not replace all breeds with one generic gray coat');
});

test('saved personal eye, ear and body choices affect the model without mutating user data',()=>{
 const customization={version:1,size:1.25,build:1.2,earSize:1.2,earShape:'rounded',eyeColor:'#86ad7c'};
 const cat={presetId:'ragdoll',customization,appearance:{version:1,strokes:[{color:'#abc123',points:[{x:.4,y:.6}]}]}};
 const before=structuredClone(cat),style=getCat3DAppearance(cat.presetId,cat.customization);
 assert.equal(style.eyeColor,customization.eyeColor);
 assert.ok(style.morphs.Build>getCat3DAppearance('ragdoll').morphs.Build);
 assert.ok(style.morphs.EarsRound>0);
 assert.deepEqual(cat,before);
 const original=cat3DAppearanceSignature(cat,{id:'ragdoll'});
 const edited=structuredClone(cat);edited.appearance.strokes[0].points[0].x=.3;
 assert.notEqual(cat3DAppearanceSignature(edited,{id:'ragdoll'}),original);
});
