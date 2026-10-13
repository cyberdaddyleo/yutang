import {splitGraphemes} from './model.js';
import {sampleMuyuStroke} from './motion.js';
import {SCENE,WOOD,PAD,IMPACT,INCENSE,BEADS,BEAD_SPRITE,CANDLE,LAMPS,sceneTransform,scenePoint,hitMuyu} from './geometry.js';
const ROOT=`${import.meta.env?.BASE_URL||'/'}assets/muyu/`;
// Decorative depth layers share the theme light state, not new interactions.
const FLOOR_LAMPS=[{x:1388,y:786,w:125,blur:1.2},{x:145,y:1110,w:330,blur:11}];
const REAR_CANDLES=[{x:278,y:371,w:114},{x:597,y:371,w:106},{x:1213,y:496,w:116}];
const REAR_WICKS=[[.20995,.24971],[.49494,.01524],[.80354,.45135]];
const SKINS=['walnut','ebony','jade','celadon','lacquer','gold','bamboo','clay'];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=t=>t*t*(3-2*t);
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()}
function glow(c,x,y,r,color,alpha){if(alpha<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(1,`rgba(${color},0)`);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
function contactShadow(c,x,y,rx,ry,alpha){c.save();c.translate(x,y);c.scale(rx,ry);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(0,0,0,${alpha})`);g.addColorStop(.55,`rgba(0,0,0,${alpha*.55})`);g.addColorStop(1,'rgba(0,0,0,0)');ellipse(c,0,0,1,1,g);c.restore()}
function buffer(w=1600,h=900){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
export class MuyuRenderer{
 constructor(canvas,onLoad=()=>{}){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.onLoad=onLoad;this.images={};this.spriteCache=new Map();this.errors=[];this.loaded=0;this.dead=false;this.windowMask=null;this.windowMasks={};this.windowLayer=buffer(1600,420);this.roomLayer=buffer();this.roomKey=null;this.width=1;this.height=1;this.scale=1;this.transform=sceneTransform(1,1);
  this.load('window-bamboo');this.load('room');this.load('room-warm-v4');this.load('room-day-v4');this.load('walnut-warm-v4');this.load('pad');this.load('mallet');for(const id of ['beads-v2','candle-v2','lantern-hanging-v3','lantern-standing-v3','incense-v2','lantern-floor-v4','candles-rear-v4'])this.load(id);for(const id of SKINS)this.load(id);
 }
 load(id){const img=new Image();img.onload=()=>{if(this.dead)return;this.images[id]=img;this.loaded++;if(id==='room'){this.prepareWindows(img);this.prepareFoliage(img);this.roomKey=null;}if(id==='room-warm-v4'||id==='room-day-v4'){this.prepareWindows(img,id);this.roomKey=null;}if(id.startsWith('lantern-'))this.prepareLitLantern(img,id);this.onLoad()};img.onerror=()=>{if(this.dead)return;this.errors.push(id);this.onLoad(`木鱼素材未加载：${id}`)};img.src=`${ROOT}${id}.webp`;}
 prepareWindows(img,id='room'){const mask=buffer(1600,420);const c=mask.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,1600,900);const d=c.getImageData(0,0,1600,420);for(let y=0;y<420;y++)for(let x=0;x<1600;x++){const i=(y*1600+x)*4;const [r,g,b]=[d.data[i],d.data[i+1],d.data[i+2]];const alpha=x>825&&y<405&&b>r+5&&g>r+2&&b>80?clamp((b-r-5)/12):0;d.data[i]=d.data[i+1]=d.data[i+2]=255;d.data[i+3]=Math.round(alpha*255)}c.putImageData(d,0,0);this.windowMasks[id]=mask;if(id==='room')this.windowMask=mask;}
 prepareLitLantern(img,id){const lit=buffer(img.width,img.height);const c=lit.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);const d=c.getImageData(0,0,img.width,img.height);const standing=id==='lantern-standing-v3',floor=id==='lantern-floor-v4';
  // Preserve the paper's texture and side shading; illumination is strongest
  // inside the lower paper chamber, never a uniformly yellow rectangle.
  for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;const [r,g,b]=[d.data[i],d.data[i+1],d.data[i+2]],u=x/img.width,v=y/img.height;
   if(v>(floor?.22:standing?.08:.25)&&v<(floor?.74:standing?.59:.85)&&r>120&&g>100&&b>75&&r-b<100){const warmth=Math.exp(-(((u-.52)/.48)**2+((v-(floor?.58:standing?.43:.66))/(standing?.3:.36))**2));d.data[i]=Math.min(255,r*1.2+warmth*40);d.data[i+1]=Math.min(239,g*(.58+warmth*.3)+warmth*27);d.data[i+2]=b*(.17+warmth*.23);}
  }c.putImageData(d,0,0);this.images[`${id}-lit`]=lit;
 }
 prepareFoliage(img){const leaf=buffer(210,325),c=leaf.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,1600,900);const d=c.getImageData(0,0,210,325);
  // Reuse only the existing green leaves in front of the left lantern. The
  // cached alpha prevents a rectangular room patch from obscuring the lamp.
  for(let y=0;y<325;y++)for(let x=0;x<210;x++){const i=(y*210+x)*4,[r,g,b]=[d.data[i],d.data[i+1],d.data[i+2]];d.data[i+3]=y>90&&x<155?255*clamp((g-b-10)/14)*clamp((g-r+3)/9):0;}
  c.putImageData(d,0,0);this.images['room-foliage']=leaf;
 }
 resize(w,h,scale=1){this.width=Math.max(1,w);this.height=Math.max(1,h);this.scale=Math.max(.5,Math.min(3,scale||1));this.canvas.width=Math.round(this.width*this.scale);this.canvas.height=Math.round(this.height*this.scale);this.transform=sceneTransform(this.width,this.height);}
 world(clientX,clientY){const b=this.canvas.getBoundingClientRect();return scenePoint((clientX-b.left)*this.width/b.width,(clientY-b.top)*this.height/b.height,this.transform)}
 hit(point){return hitMuyu(point)}
 sprite(id,filter='none'){const source=this.images[id];if(!source||filter==='none')return source;const key=`${id}:${filter}`;if(!this.spriteCache.has(key)){const target=buffer(source.width,source.height),ctx=target.getContext('2d');ctx.filter=filter;ctx.drawImage(source,0,0);this.spriteCache.set(key,target)}return this.spriteCache.get(key);}
 stats(){return {width:this.canvas.width,height:this.canvas.height,backgroundWidth:this.images.room?.naturalWidth||0,backgroundHeight:this.images.room?.naturalHeight||0,assetsLoaded:this.loaded,assetErrors:[...this.errors],renderer:'Canvas2D · 分层禅房'};}
 draw(view,env={},options={},time=0,visual={}){if(this.dead)return;const c=this.ctx,s=view.settings||{},quiet=s.reducedMotion||options.reducedMotion;const sec=quiet?0:time/1000;const night=env.time==='night'?1:env.time==='dusk'?.48:env.time==='dawn'?.2:0;const lamps=!!env.lights;
  c.setTransform(this.scale,0,0,this.scale,0,0);c.fillStyle=night?'#16171c':'#38322d';c.fillRect(0,0,this.width,this.height);const tr=this.transform;c.translate(tr.x,tr.y);c.scale(tr.scale,tr.scale);
  if(this.images.room){const roomKey=`${night}:${lamps}`;if(this.roomKey!==roomKey){const room=this.roomLayer.getContext('2d');room.clearRect(0,0,1600,900);const warm=lamps&&night>0&&this.images['room-warm-v4'];
    room.filter=night?`brightness(${1-night*.62}) saturate(${1-night*.12})`:'none';room.drawImage(this.images['room-day-v4']||this.images.room,0,0,1600,900);room.filter='none';
    // Actual relighting plate supplies material bounce/reflections only. Flames,
    // paper emission and the moon remain separate and disappear when switched off.
    if(warm){room.globalAlpha=night===1?1:night===.48?.78:.34;room.drawImage(this.images['room-warm-v4'],0,0,1600,900);room.globalAlpha=1;}this.roomKey=roomKey}c.drawImage(this.roomLayer,0,0)}else{c.fillStyle='#39312b';c.fillRect(0,0,1600,900);c.fillStyle='#efdfc0';c.font='22px serif';c.textAlign='center';c.fillText('禅房素材加载中',800,250)}

  this.outside(c,env,sec,quiet);
  if(lamps){c.save();c.globalCompositeOperation='screen';glow(c,800,615,450,'249,168,70',.03+night*.035);glow(c,1110,650,125,'248,147,54',.07+night*.08);for(const l of LAMPS)glow(c,l.x,l.y-l.h/2+l.h*l.lightY,l.w*1.8,'251,159,57',.09+night*.14);c.restore()}
  this.lanterns(c,lamps,sec,night,quiet);
  this.rearCandles(c,lamps,sec,night);
  const foliage=this.sprite('room-foliage',night?`brightness(${lamps?.65:.38}) saturate(.88)`:'none');if(foliage)c.drawImage(foliage,0,0);
  this.incense(c,s,view.focus,sec,lamps,night);
  this.beads(c,time,visual.beadsAt,quiet,night);
  this.candle(c,lamps,sec,night);
  contactShadow(c,815,624,264,20,.28);
  const pad=this.sprite('pad',night?`brightness(${lamps?.9:.48}) saturate(1.12) sepia(.14)`:'none');if(pad)c.drawImage(pad,PAD.x,PAD.y-22,PAD.w,PAD.h);
  const elapsed=time-(visual.hitAt??-Infinity),rebound=quiet?0:elapsed>=0&&elapsed<300?Math.sin(elapsed/300*Math.PI*3)*Math.exp(-elapsed/100)*.012:0;
  const skin=this.images[s.skin]?s.skin:'walnut',warmWalnut=skin==='walnut'&&night>0&&lamps&&this.images['walnut-warm-v4'];
  const body=this.sprite(warmWalnut?'walnut-warm-v4':skin,night&&!warmWalnut?`brightness(${lamps?.95:.48})`:'none');if(body){c.save();const artScale=.92,foot=WOOD.y+WOOD.h*artScale;c.translate(WOOD.anchorX,foot);c.scale(1+rebound,1-rebound);c.drawImage(body,-WOOD.w*artScale/2,-WOOD.h*artScale,WOOD.w*artScale,WOOD.h*artScale);c.restore()}
  this.mallet(c,time,visual,quiet,night,lamps);
  this.floorLanterns(c,lamps,sec,night);
  if(s.floatingText!==false)this.floating(c,visual.floats||[],time,s,quiet);
 }
 outside(c,env,time,quiet){if(!this.windowMask)return;const layer=this.windowLayer,ctx=layer.getContext('2d');ctx.clearRect(0,0,1600,900);const season=env.season||'spring',period=env.time||'day';const colors={day:['#98c7d6','#dfe9d9'],dawn:['#aabaca','#eed0b5'],dusk:['#8b9cb6','#edb784'],night:['#1d3045','#293e50']}[period]||['#98c7d6','#dfe9d9'];const g=ctx.createLinearGradient(0,0,0,420);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);ctx.fillStyle=g;ctx.fillRect(810,0,790,420);
  if(period==='night'){
   if(!this.images['moon-soft']){const moon=buffer(160,160),mc=moon.getContext('2d');mc.filter='blur(3px)';glow(mc,80,80, 70,'212,227,239',.24);ellipse(mc,80,80,28,28,'#d9dfd9');ellipse(mc,75,69,8,6,'rgba(142,161,172,.22)');ellipse(mc,88,88,10,7,'rgba(142,161,172,.24)');this.images['moon-soft']=moon;}
   ctx.drawImage(this.images['moon-soft'],1250,-6,160,160);
  }
  const bamboo=this.sprite('window-bamboo',period==='night'?'brightness(.22) saturate(.6) blur(8px)':season==='autumn'?'sepia(.45) saturate(.65)':season==='winter'?'saturate(.23) brightness(1.13)':'saturate(.8)');if(bamboo){ctx.save();ctx.globalAlpha=period==='night'?.35:.66;const sway=quiet?0:Math.sin(time*.22)*3;ctx.drawImage(bamboo,1188+sway,74,270,406);ctx.drawImage(bamboo,850-sway,80,215,320);ctx.restore();}
  const count=season==='winter'?20:season==='autumn'?8:season==='spring'?10:11;for(let i=0;i<count;i++){const phase=(time*(season==='summer'?50:10)+i*67)%440,x=860+(i*107.3)%650+Math.sin(time*.4+i)*14,y=phase-20;ctx.save();ctx.globalAlpha=period==='night'?.23:.48;if(season==='summer'){ctx.strokeStyle='#a8c6cd';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+10);ctx.stroke()}else{ctx.translate(x,y);ctx.rotate(time*.2+i);ellipse(ctx,0,0,season==='winter'?2:4,season==='winter'?2:2,season==='autumn'?'#d7a15d':season==='spring'?'#f0cdd2':'#f1f6f0')}ctx.restore()}
  ctx.globalCompositeOperation='destination-in';const mask=env.lights&&period!=='day'?(this.windowMasks['room-warm-v4']||this.windowMask):(this.windowMasks['room-day-v4']||this.windowMask);ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over';c.drawImage(layer,0,0);
 }
 lanterns(c,on,time,night,quiet){for(let i=0;i<LAMPS.length;i++){
  const l=LAMPS[i],id=l.asset,img=this.sprite(on?`${id}-lit`:id,night&&!on?'brightness(.42) blur(6px)':night?'brightness(1.02) blur(6px)':'none');if(!img)continue;
  const angle=quiet||l.standing?0:Math.sin(time*.48+i*2)*.004;
  if(!l.standing){c.strokeStyle='#3c2b20';c.lineWidth=1.5;c.beginPath();c.moveTo(l.x,0);c.lineTo(l.x,Math.max(0,l.y-l.h/2+3));c.stroke()}
  else contactShadow(c,l.x,l.y+l.h/2-1,l.w*.47,5,.25);
  c.save();c.translate(l.x,l.y-l.h/2);c.rotate(angle);
  if(on){c.save();c.globalCompositeOperation='screen';glow(c,0,l.h*l.lightY,l.w,'255,169,63',.09+night*.14);c.restore()}
  c.drawImage(img,-l.w/2,0,l.w,l.h);
  if(on){c.globalCompositeOperation='screen';glow(c,0,l.h*l.lightY,l.w*.4,'255,177,82',.18+Math.sin(time*.7+i)*.012);c.globalCompositeOperation='source-over'}c.restore();
 }}

 rearCandles(c,on,time,night){
  const img=this.sprite('candles-rear-v4',night?`brightness(${on?.85:.4}) sepia(.55) saturate(1.2) blur(16px)`:'blur(12px)');if(!img)return;
  for(let i=0;i<REAR_CANDLES.length;i++){const p=REAR_CANDLES[i],h=p.w*736/1024,x=p.x-p.w/2,y=p.y-h;
   c.drawImage(img,x,y,p.w,h);if(!on)continue;
   for(let j=0;j<REAR_WICKS.length;j++){const wick=REAR_WICKS[j];this.flame(c,x+p.w*wick[0],y+h*wick[1]+2.5,time+i+j*.7,night,.7);}
  }
 }
 floorLanterns(c,on,time,night){for(const l of FLOOR_LAMPS){const id=on?'lantern-floor-v4-lit':'lantern-floor-v4';const img=this.sprite(id,`brightness(${night&&!on?.4:1}) blur(${l.blur*692/l.w}px)`);if(!img)continue;
   const h=l.w*1024/692,x=l.x-l.w/2,y=l.y-h,cy=y+h*.54;
   c.save();if(on){c.globalCompositeOperation='screen';glow(c,l.x,cy,l.w*1.18,'255,159,50',.16+night*.1);c.globalCompositeOperation='source-over';}
   c.drawImage(img,x,y,l.w,h);
   if(on){c.globalCompositeOperation='screen';glow(c,l.x,cy,l.w*.58,'255,174,68',.18+Math.sin(time*.6)*.008);}
   c.restore();
  }}
 incense(c,s,focus,time,lamps,night){
  const x=INCENSE.x,y=INCENSE.y,progress=focus?.durationMs?clamp(focus.remainingMs/focus.durationMs):1;
  const stickHeight=focus?.status==='idle'?106:58+progress*48,stick=this.sprite('incense-v2',night?`brightness(${lamps?.78:.4})`:'none');
  // Three separately visible sticks enter the actual mouth of the background urn.
  // Reveal a shorter section as the focus incense burns; never stretch the texture.
  if(stick){const sourceH=stick.height*stickHeight/106;c.drawImage(stick,0,0,stick.width,sourceH,x-9.6,y-stickHeight+7,19.2,stickHeight)}
  if(this.images.room)c.drawImage(this.roomLayer,x-13,y+1,26,8,x-13,y+1,26,8);
  if(!s.smoke)return;
  const offsets=[[-8.24,3.78],[.27,.53],[8.16,6.74]];
  for(let strand=0;strand<3;strand++){
   const tip={x:x+offsets[strand][0],y:y-stickHeight+7+offsets[strand][1]};
   ellipse(c,tip.x,tip.y+.6,.65,.9,'#d98046');
   // Continuous ribbons advect upward. One gradient stroke per ribbon replaces
   // hundreds of individually blurred segments; RAF elapsed time drives the flow.
   const height=176+strand*12;
   const point=u=>({x:tip.x+u*Math.sin(time*.27)*22+Math.pow(u,.65)*Math.sin(u*10-time*.55+strand*.5)*32+Math.sin(u*17-time*.61+strand)*u*u*12,y:tip.y-u*height});
   for(let pass=0;pass<2;pass++){
    const fade=c.createLinearGradient(0,tip.y,0,tip.y-height);const opacity=(pass===0?.09:.24)*(lamps?1:.72);
    fade.addColorStop(0,`rgba(219,222,223,${opacity*.55})`);fade.addColorStop(.18,`rgba(228,229,230,${opacity})`);fade.addColorStop(.67,`rgba(222,225,228,${opacity*.55})`);fade.addColorStop(1,'rgba(222,225,228,0)');
    c.save();c.lineCap='round';c.lineJoin='round';c.lineWidth=pass===0?7:1.7;c.strokeStyle=fade;c.beginPath();c.moveTo(tip.x,tip.y);
    for(let j=1;j<=36;j++){const a=point((j-.5)/36),b=point(j/36);c.quadraticCurveTo(a.x,a.y,b.x,b.y)}c.stroke();c.restore();
   }
  }
 }
 beads(c,time,at,quiet,night){const img=this.sprite('beads-v2',night?'brightness(.88) saturate(1.08) sepia(.14)':'none');if(!img)return;
  const age=time-(at??-Infinity),sway=!quiet&&age>=0&&age<1000?Math.sin(age*.016)*Math.exp(-age/300)*.012:0;
  c.save();c.translate(BEADS.x,BEADS.y);c.rotate(sway);c.drawImage(img,BEAD_SPRITE.x-BEADS.x,BEAD_SPRITE.y-BEADS.y,BEAD_SPRITE.w,BEAD_SPRITE.h);c.restore();
 }
 candle(c,on,time,night){const l=CANDLE,img=this.sprite('candle-v2',night&&!on?'brightness(.4)':'none');if(!img)return;
  ellipse(c,l.x+l.w/2,l.y+l.h-1,l.w*.44,3,'rgba(12,8,5,.32)');c.drawImage(img,l.x,l.y,l.w,l.h);if(!on)return;
  this.flame(c,l.wickX,l.wickY,time,night);
 }
 flame(c,wx,wy,time,night,scale=1){c.save();c.translate(wx,wy);c.scale(scale,scale);const x=0,y=0,lean=Math.sin(time*2.3)*.9+Math.sin(time*4.1)*.3,height=19+Math.sin(time*2.7)*1.1;
  c.save();c.globalCompositeOperation='screen';glow(c,x,y-8,64,'255,173,61',.17+night*.16);glow(c,x,y+35,40,'240,159,65',.12);c.restore();
  const flame=c.createLinearGradient(x,y,x,y-height);flame.addColorStop(0,'rgba(226,121,37,.75)');flame.addColorStop(.25,'#ffe4a0');flame.addColorStop(.7,'#f7b75b');flame.addColorStop(1,'rgba(249,167,69,.2)');
  c.fillStyle=flame;c.beginPath();c.moveTo(x,y+1);c.bezierCurveTo(x-5,y-4,x-3+lean,y-height*.67,x+lean,y-height);c.bezierCurveTo(x+lean+1,y-height*.6,x+7,y-4,x,y+1);c.fill();ellipse(c,x,y-3,1.4,3.7,'#fff7d8');c.restore();
 }
 mallet(c,time,visual,quiet,night,lamps){const img=this.sprite('mallet',night?`brightness(${lamps?1.08:.5}) saturate(1.1) sepia(.14)`:'none');if(!img)return;
  const pose=sampleMuyuStroke(visual.stroke,time),amount=pose.amount;
  // Align the padded striking face, not the PNG corner, at the contact point.
  // A shallow arc and rotation share the model's single continuous stroke clock.
  const right=(this.width-this.transform.x)/this.transform.scale,shift=Math.min(0,right-1430),lift=-38*ease(clamp(-shift/70));
  const travel=quiet?.16:1,restHead={x:IMPACT.x+(1033+shift-IMPACT.x)*travel,y:IMPACT.y+(275+lift-IMPACT.y)*travel};const headX=restHead.x+(IMPACT.x-restHead.x)*amount,headY=restHead.y+(IMPACT.y-restHead.y)*amount+pose.lift;
  c.save();c.translate(headX,headY);c.rotate((quiet?-.035:-.19)*amount+pose.rotation);c.drawImage(img,-17,-54,395,199);c.restore();
 }
 floating(c,list,time,s,quiet){const size=clamp(s.textSize||36,18,64);for(const item of list.slice(-12)){const age=time-item.at;if(age<0||age>2100)continue;const t=age/2100;c.save();c.globalAlpha=Math.min(1,age/80)*(1-ease(clamp((t-.45)/.55)));c.fillStyle=s.textColor||'#f6d9a0';c.shadowColor='rgba(33,22,9,.5)';c.shadowBlur=8;c.font=`500 ${size}px "Noto Serif SC", "Songti SC", serif`;c.textAlign='center';const x=820+(quiet?0:Math.sin(item.id*2.4)*24),y=quiet?226:238-t*110;if(s.textDirection==='vertical'){const chars=splitGraphemes(item.text||'');chars.forEach((ch,i)=>c.fillText(ch,x,y+i*size*1.12))}else c.fillText(item.text||'',x,y);c.restore()}}
 destroy(){this.dead=true;this.images={};this.spriteCache.clear();this.windowMask=null;this.windowMasks={};this.foliageMask=null;this.windowLayer.width=this.windowLayer.height=1;this.roomLayer.width=this.roomLayer.height=1;this.litLantern=null;this.onLoad=()=>{}}
}
