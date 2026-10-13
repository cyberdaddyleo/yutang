import {normalizeCustomization} from './customization.js';
import {drawStroke} from './appearance.js';
import {addCatFur} from './three-cat-fur.js';
import {acquireCatFurDetail} from './three-cat-fur-detail.js';

// Coat locations are authored in the unskinned model's coordinates, so patches
// stay on the animal as its joints move. One shader serves all sixteen coats.
export const CAT_3D_STYLES=Object.freeze({
 ragdoll:{base:'#fff9ee',mark:'#8d8580',dark:'#625b57',eye:'#79b7d6',mode:1,build:.35,fluff:1,cheeks:.65,muzzle:.12,ears:0},
 'british-shorthair':{base:'#87919d',mark:'#77818d',dark:'#616b77',eye:'#cf9f43',mode:0,build:.8,fluff:.16,cheeks:1,muzzle:.32,ears:-.35},
 chinchilla:{base:'#f2eee4',mark:'#aeb0ae',dark:'#8d9290',eye:'#86ad7c',mode:9,build:.5,fluff:1,cheeks:1,muzzle:.62,ears:-.35},
 'american-shorthair':{base:'#bdc1bd',mark:'#777d78',dark:'#525954',eye:'#aaa964',mode:2,build:.45,fluff:.13,cheeks:.5,muzzle:.12,ears:0},
 siamese:{base:'#e2d2b9',mark:'#6b574b',dark:'#433b35',eye:'#69b0d2',mode:3,build:-.25,fluff:0,cheeks:-.2,muzzle:0,ears:.65},
 'domestic-orange-white':{base:'#f2e5ce',mark:'#d7954e',dark:'#b16d34',eye:'#b5a053',mode:4,build:.25,fluff:.16,cheeks:.4,muzzle:.12,ears:.15},
 'maine-coon':{base:'#d2ab77',mark:'#9c7045',dark:'#624328',eye:'#a9ab61',mode:2,build:.5,fluff:1,cheeks:.3,muzzle:0,ears:.55},
 'domestic-tabby':{base:'#b29f80',mark:'#786b50',dark:'#514b3a',eye:'#9dae64',mode:2,build:.1,fluff:.15,cheeks:.1,muzzle:0,ears:.15},
 'russian-blue':{base:'#879eae',mark:'#7d909e',dark:'#637783',eye:'#8cbb70',mode:0,build:-.2,fluff:.08,cheeks:-.2,muzzle:0,ears:.5},
 'norwegian-forest':{base:'#d3ad79',mark:'#a47345',dark:'#714e31',eye:'#9ab264',mode:10,build:.3,fluff:1,cheeks:.25,muzzle:.1,ears:.35},
 'domestic-tuxedo':{base:'#ede8db',mark:'#343b3e',dark:'#272e30',eye:'#c3ae60',mode:5,build:.25,fluff:.12,cheeks:.3,muzzle:.08,ears:.2},
 'domestic-calico':{base:'#eee5d4',mark:'#cc9457',dark:'#4c4840',eye:'#a9b370',mode:6,build:.2,fluff:.16,cheeks:.35,muzzle:.12,ears:.2},
 persian:{base:'#f1e9d9',mark:'#e1d5be',dark:'#b9ac97',eye:'#bf9952',mode:0,build:.75,fluff:1,cheeks:1,muzzle:.85,ears:-.6},
 'exotic-shorthair':{base:'#e6d2ad',mark:'#c7a97d',dark:'#b4946d',eye:'#b38f4c',mode:2,build:.8,fluff:.3,cheeks:1,muzzle:.75,ears:-.5},
 bengal:{base:'#ceb080',mark:'#ad8658',dark:'#63513a',eye:'#a1ad65',mode:7,build:.05,fluff:.04,cheeks:.05,muzzle:0,ears:-.1},
 abyssinian:{base:'#ba875b',mark:'#906847',dark:'#65513d',eye:'#b4b069',mode:8,build:-.2,fluff:.05,cheeks:-.1,muzzle:0,ears:.65},
});
const EYE_SIZE=Object.freeze({ragdoll:.35,'british-shorthair':.9,chinchilla:.65,'american-shorthair':.2,siamese:-.15,'domestic-orange-white':.25,'maine-coon':.15,'domestic-tabby':.1,'russian-blue':-.15,'norwegian-forest':.2,'domestic-tuxedo':.3,'domestic-calico':.3,persian:.85,'exotic-shorthair':1,bengal:.05,abyssinian:-.15});
export function getCat3DAppearance(presetId,customization){
 const s=CAT_3D_STYLES[presetId]||CAT_3D_STYLES.ragdoll,c=normalizeCustomization(customization);
 return {...s,eyeColor:c.eyeColor==='original'?s.eye:c.eyeColor,furColor:s.base,noseColor:'#c98f8e',roughness:.96,
 morphs:{Build:Math.max(-.7,Math.min(1,s.build+(c.build-1)*2)),Fluff:s.fluff,Cheeks:s.cheeks,MuzzleShort:s.muzzle,EyeSize:EYE_SIZE[presetId]??.25,EarsLarge:Math.max(-1,Math.min(1,s.ears+(c.earSize-1)*2+(c.earShape==='pointed'?.22:0))),EarsRound:c.earShape==='rounded'?.8:Math.max(0,-s.ears)},customization:c};
}
export function cat3DAppearanceSignature(cat,preset){return JSON.stringify([preset?.id||cat.presetId,cat.customization,cat.appearance]);}
const VERTEX=`varying vec3 vCatRest; varying vec3 vCatRestNormal;`;
const FRAGMENT=`
varying vec3 vCatRest;
varying vec3 vCatRestNormal;
uniform sampler2D catFurDetail;
uniform float catFurDetailReady;
uniform vec3 catBase,catMark,catDark;
uniform float catMode,catFluff,catHasPaint;
uniform sampler2D catPaint;
float catHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float catNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(catHash(i),catHash(i+vec3(1,0,0)),f.x),mix(catHash(i+vec3(0,1,0)),catHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(catHash(i+vec3(0,0,1)),catHash(i+vec3(1,0,1)),f.x),mix(catHash(i+vec3(0,1,1)),catHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float catFurLuminance(vec3 p,vec3 n){
 vec3 blend=pow(abs(normalize(n)),vec3(4.0));blend/=max(.0001,blend.x+blend.y+blend.z);
 float scale=mix(.85,1.65,catFluff);
 vec3 detail=texture2D(catFurDetail,p.yz/scale).rgb*blend.x+texture2D(catFurDetail,p.xz/scale).rgb*blend.y+texture2D(catFurDetail,p.xy/scale).rgb*blend.z;
 return dot(detail,vec3(.2126,.7152,.0722));
}
vec3 catFurSurfaceNormal(vec3 viewPosition,vec3 surfaceNormal,float height){
 vec3 dx=dFdx(viewPosition),dy=dFdy(viewPosition),crossY=cross(dy,surfaceNormal),crossX=cross(surfaceNormal,dx);
 float determinant=dot(dx,crossY);
 vec3 gradient=sign(determinant)*(dFdx(height)*crossY+dFdy(height)*crossX);
 return abs(determinant)<.000000000001?surfaceNormal:normalize(abs(determinant)*surfaceNormal-gradient);
}
float catLine(vec2 p,vec2 a,vec2 b,float width){
 vec2 q=p-a,d=b-a;float t=clamp(dot(q,d)/dot(d,d),0.0,1.0);
 return 1.0-smoothstep(width,width+.0035,length(q-d*t));
}
float catCoatStroke(vec2 p,float at,float from,float to,float width,float bend,float turn){
 float t=(p.y-from)/(to-from),e=clamp(t,0.0,1.0);
 float center=at+bend*e+turn*sin(e*3.141593);
 float taper=.34+.66*sin(e*3.141593);
 return (1.0-smoothstep(width*taper,width*taper+.0065,abs(p.x-center)))*smoothstep(0.0,.10,t)*(1.0-smoothstep(.84,1.0,t));
}
float catTabby(vec2 uv){
 float side=step(0.0,uv.y);vec2 p=vec2(uv.x,abs(uv.y));
 // Individual tapering brush paths; the two flanks are intentionally offset.
 p.x+=mix(-.013,.009,side);float mark=0.0;
 mark=max(mark,catCoatStroke(p,-.208,.012,.146,.009,-.032,.015));
 mark=max(mark,catCoatStroke(p,-.142,.001,.178,.014,.022,-.015));
 mark=max(mark,catCoatStroke(p,-.074,.018,.142,.010,-.043,.016));
 mark=max(mark,catCoatStroke(p,-.021,.008,.188,.016,.013,-.014));
 mark=max(mark,catCoatStroke(p,.047,.025,.148,.011,-.031,.010));
 mark=max(mark,catCoatStroke(p,.103,.006,.173,.015,.025,-.015));
 mark=max(mark,catCoatStroke(p,.160,.021,.113,.008,-.025,.008));
 // Short forks diverge down the flank instead of forming complete hoops.
 mark=max(mark,catCoatStroke(p,-.054,.078,.164,.008,-.041,-.013));
 mark=max(mark,catCoatStroke(p,.086,.082,.197,.007,.045,.015));
 return mark;
}
vec2 catRosette(vec2 p,vec2 center,vec2 radius,float angle,float seed){
 p-=center;float c=cos(angle),s=sin(angle);p=mat2(c,-s,s,c)*p/radius;
 float a=atan(p.y,p.x),d=length(p),rim=.72+.10*sin(a*3.0+seed)+.06*sin(a*5.0-seed);
 float broken=smoothstep(.10,.42,sin(a+seed)+.67);
 float edge=(1.0-smoothstep(.14,.27,abs(d-rim)))*broken;
 return vec2(edge,1.0-smoothstep(.53,.78,d));
}
vec2 catBengal(vec2 p){
 // Unequal, rotated, open rosettes placed over an unfolded torso. No tiled grid.
 vec2 r=vec2(0.0);
 r=max(r,catRosette(p,vec2(-.211,-.091),vec2(.034,.041),-.55,1.1));
 r=max(r,catRosette(p,vec2(-.171,.021),vec2(.038,.047),.24,2.3));
 r=max(r,catRosette(p,vec2(-.118,-.136),vec2(.031,.049),.63,3.2));
 r=max(r,catRosette(p,vec2(-.105,-.047),vec2(.045,.033),-.38,4.1));
 r=max(r,catRosette(p,vec2(-.087,.112),vec2(.048,.039),.77,5.0));
 r=max(r,catRosette(p,vec2(-.026,.013),vec2(.041,.050),-.65,6.2));
 r=max(r,catRosette(p,vec2(-.010,-.109),vec2(.036,.041),.36,2.8));
 r=max(r,catRosette(p,vec2(.032,.121),vec2(.043,.051),-.15,4.9));
 r=max(r,catRosette(p,vec2(.069,-.034),vec2(.035,.044),.69,3.9));
 r=max(r,catRosette(p,vec2(.098,-.132),vec2(.039,.035),-.83,1.7));
 r=max(r,catRosette(p,vec2(.136,.063),vec2(.035,.044),.11,5.6));
 r=max(r,catRosette(p,vec2(-.225,.104),vec2(.026,.035),.81,3.3));
 r=max(r,catRosette(p,vec2(-.134,.171),vec2(.031,.037),-.21,1.3));
 r=max(r,catRosette(p,vec2(-.055,-.194),vec2(.032,.039),.47,4.4));
 r=max(r,catRosette(p,vec2(.001,-.044),vec2(.022,.029),-.65,2.1));
 r=max(r,catRosette(p,vec2(.071,.022),vec2(.026,.032),-.91,3.5));
 r=max(r,catRosette(p,vec2(.150,-.035),vec2(.031,.037),.53,5.9));
 return r;
}
vec3 catCoat(vec3 p,float furLuma){
 float n=catNoise(p*26.0),head=smoothstep(.16,.235,p.z),tail=(1.0-smoothstep(-.255,-.215,p.z))*smoothstep(.30,.38,p.y);
 float back=smoothstep(.255,.345,p.y)*(1.0-smoothstep(.13,.23,p.z));
 float muzzle=head*(1.0-smoothstep(.40,.435,p.y));
 float bib=smoothstep(.055,.155,p.z)*(1.0-smoothstep(.28,.38,p.y));
 float paws=1.0-smoothstep(.058,.09,p.y);
 float grain=catNoise(vec3(p.x*175.0,p.y*135.0,p.z*27.0));
 vec2 torso=vec2(p.z,atan(p.x,p.y-.275)*.12);
 // Real painted fibers break up pigment boundaries too: markings belong to
 // individual locks, rather than smooth stickers laid over the fur surface.
 vec2 brushed=torso+vec2((grain-.5)*.012+(furLuma-.86)*mix(.008,.033,catFluff),(n-.5)*.006);
 float stripe=0.0;
 if((catMode>1.5&&catMode<2.5)||(catMode>3.5&&catMode<4.5)||catMode>9.5){
  stripe=catTabby(brushed)*smoothstep(.19,.24,p.y);
  stripe=max(stripe,(1.0-smoothstep(.010,.019,abs(torso.y+.003*sin(p.z*29.0))))*back*.72);
 }
 vec2 face=vec2(abs(p.x),p.y);
 float faceStripe=max(catLine(face,vec2(.013,.452),vec2(.019,.474),.0025),catLine(face,vec2(.044,.467),vec2(.057,.481),.003));
 faceStripe=max(faceStripe,catLine(face,vec2(.065,.438),vec2(.095,.451),.005));
 faceStripe=max(faceStripe,catLine(face,vec2(.067,.417),vec2(.095,.426),.004));
 faceStripe*=.55;
 float rings=smoothstep(.10,.68,sin(p.y*99.0+sin(p.z*43.0)*.75+catNoise(p*25.0)*.65));
 vec3 color=catBase;
 if(catMode>.5&&catMode<1.5){
  vec2 q=brushed;
  float hind=1.0-smoothstep(.77,1.10,length((q-vec2(-.133,-.012))/vec2(.155,.107)));
  float shoulder=1.0-smoothstep(.77,1.10,length((q-vec2(.091,.020))/vec2(.087,.100)));
  float whiteFlank=1.0-smoothstep(.52,1.06,length((q-vec2(-.023,.079))/vec2(.116,.072)));
  float oppositeFlank=1.0-smoothstep(.54,1.05,length((q-vec2(.009,-.092))/vec2(.066,.074)));
  float saddle=max(hind,shoulder)*(1.0-max(whiteFlank,oppositeFlank)*.97)*back;
  float mask=head*smoothstep(.014,.049,abs(p.x))*(1.0-muzzle*.7);
  color=mix(catBase,catMark,clamp(max(max(saddle,tail),mask),0.0,.94));
  float blaze=head*(1.0-smoothstep(.023,.041,abs(p.x)))*(1.0-smoothstep(.47,.53,p.y));
  color=mix(color,catBase,max(max(paws,blaze),bib*.8));
 }else if((catMode>1.5&&catMode<2.5)||catMode>9.5){
  float pattern=mix(stripe,faceStripe*.60,head);pattern=mix(pattern,rings*mix(1.0,.42,catFluff)*(.70+n*.30),tail);
  pattern=max(pattern,rings*(1.0-smoothstep(.13,.23,p.y))*.65);
  color=mix(catBase,catDark,pattern*.82);
  color=mix(color,catMark,.055+catNoise(p*11.0)*.065);
  color=mix(color,catBase,muzzle*.67);
  if(catMode>9.5){
   float flankWhite=1.0-smoothstep(.70,1.05,length((brushed-vec2(-.063,.082))/vec2(.120,.074)));
   float otherWhite=1.0-smoothstep(.64,1.06,length((brushed-vec2(.010,-.089))/vec2(.085,.070)));
   color=mix(color,vec3(.89,.84,.74),max(max(paws,bib),max(flankWhite,otherWhite)*(1.0-head)*(1.0-tail)));
  }
 }else if(catMode>2.5&&catMode<3.5){
  float mask=max(head*smoothstep(.245,.315,p.z),max(tail,(1.0-smoothstep(.05,.16,p.y))*.95));
  color=mix(catBase,catMark,mask);
 }else if(catMode>3.5&&catMode<4.5){
  float coatPatch=max(back,head*(1.0-muzzle*.6));
  color=mix(catBase,mix(catMark,catDark,stripe*.52),max(coatPatch,tail));
  color=mix(color,catBase,max(paws,bib));
 }else if(catMode>4.5&&catMode<5.5){
  // The existing portrait is a white cow-pattern cat with separate black
  // islands, not a solid black saddle. Paint those landmarks in rest space.
  float rump=1.0-smoothstep(.78,1.09,length((brushed-vec2(-.161,-.012))/vec2(.092,.097)));
  float shoulder=1.0-smoothstep(.74,1.06,length((brushed-vec2(.085,.038))/vec2(.072,.081)));
  float sidePatch=1.0-smoothstep(.72,1.10,length((brushed-vec2(-.023,-.089))/vec2(.047,.068)));
  float coatPatch=max(max(rump,max(shoulder,sidePatch))*back,max(head,tail));color=mix(catBase,catMark,coatPatch);
  float blaze=head*(1.0-smoothstep(.009,.025,abs(p.x)))*(1.0-smoothstep(.43,.49,p.y));
  color=mix(color,catBase,max(max(paws,bib),blaze));
 }else if(catMode>5.5&&catMode<6.5){
  float patches=catNoise(p*17.0+vec3(2,0,4));
  color=mix(catBase,catMark,smoothstep(.42,.53,patches));
  color=mix(color,catDark,smoothstep(.62,.72,patches));
  color=mix(color,catBase,max(paws,bib)*.88);
 }else if(catMode>6.5&&catMode<7.5){
  vec2 rosette=catBengal(brushed);
  float torsoMask=(1.0-head)*(1.0-tail)*smoothstep(.19,.25,p.y);
  color=mix(catBase,catMark,rosette.y*torsoMask*.8);
  color=mix(color,catDark,rosette.x*torsoMask*.95);
  color=mix(color,catDark,max(faceStripe*head,rings*tail)*.78);
 }else if(catMode>7.5&&catMode<8.5){color=mix(catBase,catMark,back*.5+n*.12);}
 else if(catMode>8.5&&catMode<9.5){color=mix(catBase,catMark,back*.31+tail*.24);}
 color=mix(color,catBase,muzzle*.3);
 float ear=smoothstep(.49,.525,p.y)*head*smoothstep(.028,.052,abs(p.x))*(1.0-smoothstep(.073,.093,abs(p.x)));
 color=mix(color,vec3(.51,.31,.29),ear*.62);
 color*=.94+.12*grain;
 color=mix(color,catBase,catFluff*.035);
 if(catHasPaint>.5){vec2 uv=vec2(.52-p.z*1.08+p.x*.58,.58+p.z*.60-(p.y-.25)*.62+p.x*.32);vec4 paint=texture2D(catPaint,clamp(uv,0.0,1.0));color=mix(color,pow(paint.rgb,vec3(2.2)),paint.a*.85);}
 return color;
}`;
export function applyCat3DAppearance(model,cat,preset,THREE){
 const style=getCat3DAppearance(preset?.id||cat.presetId,cat.customization),materials=[];
 let paintTexture;
 const strokes=cat.appearance?.strokes||[];
 if(strokes.length&&typeof document!=='undefined'){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  strokes.forEach(s=>drawStroke(ctx,s,preset,256,256));
  // Protected original eyes/nose are never repainted.
  ctx.globalCompositeOperation='destination-out';for(const a of preset.protectedAreas||[]){ctx.beginPath();ctx.ellipse(a.x*256,a.y*256,a.rx*256,a.ry*256,0,0,Math.PI*2);ctx.fill();}
  paintTexture=new THREE.CanvasTexture(c);paintTexture.flipY=false;
 }else {paintTexture=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);paintTexture.needsUpdate=true;}
 const furDetail=acquireCatFurDetail(THREE);
 const uniforms={catFurDetail:furDetail.sampler,catFurDetailReady:furDetail.ready,catBase:{value:new THREE.Color(style.base)},catMark:{value:new THREE.Color(style.mark)},catDark:{value:new THREE.Color(style.dark)},catMode:{value:style.mode},catFluff:{value:style.fluff},catHasPaint:{value:strokes.length?1:0},catPaint:{value:paintTexture}};
 model.traverse(o=>{
  if(o.morphTargetDictionary)for(const [name,value]of Object.entries(style.morphs)){const index=o.morphTargetDictionary[name];if(index!==undefined)o.morphTargetInfluences[index]=value;}
  if(!o.isMesh)return;
  const original=Array.isArray(o.material)?o.material:[o.material];
  const styled=original.map(source=>{const m=source.clone();materials.push(m);m.userData={...source.userData,catStyled:true};
   if(source.name.startsWith('Fur')||source.name.includes('warm grey coat')){
    m.color.set('#ffffff');m.roughness=.94;m.metalness=0;
    if('specularIntensity'in m)m.specularIntensity=.14;
    if('sheen'in m){m.sheen=.28;m.sheenRoughness=1;m.sheenColor.set('#cfc9be');}
    m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+VERTEX).replace('#include <begin_vertex>','#include <begin_vertex>\n vCatRest=position; vCatRestNormal=normal;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+FRAGMENT).replace('#include <color_fragment>','#include <color_fragment>\n float furDetailValue=catFurLuminance(vCatRest,vCatRestNormal);\n diffuseColor.rgb*=catCoat(vCatRest,mix(.86,furDetailValue,catFurDetailReady));\n diffuseColor.rgb*=1.0+clamp((furDetailValue-.86)*mix(2.9,4.0,catFluff),-.44,.34)*catFurDetailReady;').replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n normal=catFurSurfaceNormal(-vViewPosition,normal,furDetailValue*mix(.0025,.0050,catFluff)*catFurDetailReady);');};
    m.customProgramCacheKey=()=> 'courtyard-fur-v9';
   }else if(source.name.startsWith('Iris')||source.name==='Amber iris'){m.color.set(style.eyeColor);m.roughness=.38;}
   else if(source.name.startsWith('Nose'))m.color.set(style.noseColor);
   else if(source.name.startsWith('Pupil')){m.color.set('#26312e');m.roughness=.45;}
   else if(source.name.startsWith('EyeGlint')){m.color.set('#fff5dc');m.roughness=.3;}
   return m;
  });o.material=Array.isArray(o.material)?styled:styled[0];
 });
 const fur=addCatFur(model,THREE,{fluff:style.fluff});
 return{signature:cat3DAppearanceSignature(cat,preset),style,fur:fur.mesh,dispose(){fur.dispose();furDetail.dispose();for(const m of materials)m.dispose();paintTexture.dispose();}};
}
