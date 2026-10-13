// Original synthesized percussion. No recording, network request, music or
// continuous source. A strike is either played now or discarded, never queued.
const clamp=(value,min,max)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):min;
export const MUYU_TONE_PROFILES=Object.freeze({
 wood:{frequencies:[456,732,1124],gains:[.65,.24,.11],decay:.19},
 deep:{frequencies:[268,426,654],gains:[.72,.20,.08],decay:.28},
 clear:{frequencies:[688,1098,1726],gains:[.64,.25,.11],decay:.37}
});
export class MuyuAudio{
 constructor({contextFactory,clock=()=>globalThis.performance?.now?.()??Date.now()}={}){
  this.contextFactory=contextFactory||(()=>{const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;return AudioContext?new AudioContext():null});
  this.clock=clock;this.context=null;this.master=null;this.enabled=false;this.volume=0;this.unlocked=false;this.suspended=false;this.dead=false;this.error=false;this.generation=0;this.voices=new Set();this.lastHit=-Infinity;this.lastCue=-Infinity;
 }
 configure(enabled,volume=1){
  if(this.dead)return;
  this.volume=clamp(volume,0,1);this.enabled=!!enabled&&this.volume>0;
  if(!this.enabled){this.stop();return}
  this.suspended=false;
  if(this.master)this.master.gain.setValueAtTime(this.volume*.32,this.context.currentTime);
 }
 async unlock(){
  if(this.dead||!this.enabled)return false;
  const generation=this.generation;
  try{
   if(!this.context){this.context=this.contextFactory();if(!this.context){this.error=true;return false}this.master=this.context.createGain();this.master.gain.setValueAtTime(this.volume*.32,this.context.currentTime);this.master.connect(this.context.destination)}
   if(this.context.state!=='running')await this.context.resume();
   if(this.dead||!this.enabled||generation!==this.generation)return false;
   this.unlocked=this.context.state==='running';this.suspended=false;
   this.master.gain.setValueAtTime(this.volume*.32,this.context.currentTime);return this.unlocked;
  }catch{this.error=true;return false}
 }
 get allowed(){return!this.dead&&this.enabled&&this.unlocked&&!this.suspended&&this.context?.state==='running'}
 hit(tone='wood'){
  const now=this.clock();
  if(!this.allowed||now-this.lastHit<35)return false;
  this.lastHit=now;return this.play(tone,1);
 }
 cue(kind='complete'){
  const now=this.clock();
  if(!this.allowed||now-this.lastCue<250)return false;
  this.lastCue=now;return this.play(kind==='beads'?'wood':'clear',kind==='complete'?.55:.25);
 }
 play(tone,level){
  if(!this.allowed)return false;
  // Bound both scheduled oscillators and active tails during very fast inputs.
  while(this.voices.size>=4)this.finish(this.voices.values().next().value);
  const ctx=this.context,profile=MUYU_TONE_PROFILES[tone]||MUYU_TONE_PROFILES.wood;
  const now=ctx.currentTime,voice={nodes:[],ended:false};this.voices.add(voice);
  try{
   profile.frequencies.forEach((frequency,index)=>{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency*(index===0?1.07:1),now);oscillator.frequency.exponentialRampToValueAtTime(frequency,now+.025);
    const decay=profile.decay*(1-index*.19);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(profile.gains[index]*level,now+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+decay);
    oscillator.connect(gain);gain.connect(this.master);voice.nodes.push({oscillator,gain});
    if(index===0)oscillator.onended=()=>this.finish(voice);
    oscillator.start(now);oscillator.stop(now+decay+.01);
   });return true;
  }catch{this.finish(voice);this.error=true;return false}
 }
 finish(voice){
  if(!voice||voice.ended)return;voice.ended=true;this.voices.delete(voice);
  for(const{oscillator,gain}of voice.nodes){oscillator.onended=null;try{gain.gain.cancelScheduledValues(this.context.currentTime);gain.gain.setValueAtTime(0,this.context.currentTime);oscillator.stop()}catch{}oscillator.disconnect();gain.disconnect()}
 }
 stop(){
  this.generation++;this.suspended=true;this.lastHit=this.lastCue=-Infinity;
  for(const voice of [...this.voices])this.finish(voice);
  if(this.master){this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setValueAtTime(0,this.context.currentTime)}
 }
 get status(){if(this.dead||!this.enabled)return'off';if(this.error)return'error';if(!this.unlocked||this.context?.state!=='running')return'waiting';return this.suspended?'paused':'ready'}
 destroy(){if(this.dead)return;this.stop();this.dead=true;this.unlocked=false;this.master?.disconnect();const result=this.context?.close();result?.catch?.(()=>{});this.context=null;this.master=null}
}
