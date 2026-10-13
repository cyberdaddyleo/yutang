import test from 'node:test';
import assert from 'node:assert/strict';
import {MuyuAudio,MUYU_TONE_PROFILES} from '../src/themes/muyu/audio.js';

function fixture({state='running',delayResume=false}={}){
 let now=0,creations=0,resolveResume;
 const parameter=()=>({value:0,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v},cancelScheduledValues(){}});
 const ctx={state,currentTime:0,destination:{},oscillators:[],gains:[],
  createGain(){const gain={gain:parameter(),connected:false,connect(){this.connected=true},disconnect(){this.connected=false}};this.gains.push(gain);return gain},
  createOscillator(){const osc={frequency:parameter(),connected:false,starts:0,stops:[],connect(){this.connected=true},disconnect(){this.connected=false},start(){this.starts++},stop(at){this.stops.push(at)},onended:null};this.oscillators.push(osc);return osc},
  resume(){if(delayResume)return new Promise(resolve=>{resolveResume=()=>{this.state='running';resolve()}});this.state='running';return Promise.resolve()},
  close(){this.state='closed';return Promise.resolve()}
 };
 const audio=new MuyuAudio({contextFactory:()=>{creations++;return ctx},clock:()=>now});
 return{audio,ctx,get creations(){return creations},advance(ms){now+=ms;ctx.currentTime=now/1000},resume(){resolveResume()}};
}

test('theme load and configure never create an audio context or start a source',()=>{
 const f=fixture();f.audio.configure(true,1);assert.equal(f.creations,0);assert.equal(f.audio.status,'waiting');assert.equal(f.audio.hit(),false);assert.equal(f.ctx.oscillators.length,0);f.audio.destroy();
});

test('a locked hit is discarded and is not replayed after unlock',async()=>{
 const f=fixture({state:'suspended',delayResume:true});f.audio.configure(true,.6);
 const unlocking=f.audio.unlock();assert.equal(f.audio.hit(),false);assert.equal(f.ctx.oscillators.length,0);
 f.resume();assert.equal(await unlocking,true);assert.equal(f.ctx.oscillators.length,0);
 assert.equal(f.audio.hit('wood'),true);assert.equal(f.ctx.oscillators.length,3);f.audio.destroy();
});

test('100 simultaneous audio calls are coalesced and never form a deferred queue',async()=>{
 const f=fixture();f.audio.configure(true,1);await f.audio.unlock();
 const results=Array.from({length:100},()=>f.audio.hit('wood'));
 assert.equal(results.filter(Boolean).length,1);assert.equal(f.ctx.oscillators.length,3);assert.equal(f.audio.voices.size,1);
 f.advance(10000);assert.equal(f.ctx.oscillators.length,3);f.audio.destroy();
});

test('rapid accepted audio calls keep at most four percussion tails, including cues',async()=>{
 const f=fixture();f.audio.configure(true,1);await f.audio.unlock();
 for(let i=0;i<100;i++){f.advance(36);f.audio.hit(i%2?'deep':'clear');assert.ok(f.audio.voices.size<=4);assert.ok(f.ctx.oscillators.filter(n=>n.connected).length<=12)}
 f.audio.cue('complete');assert.equal(f.audio.voices.size,4);f.audio.stop();
 assert.equal(f.audio.voices.size,0);assert.equal(f.ctx.oscillators.filter(n=>n.connected).length,0);assert.equal(f.ctx.gains[0].gain.value,0);assert.equal(f.audio.hit(),false);f.audio.destroy();
});

test('stop while browser unlock is pending invalidates the unlock and never emits a late sound',async()=>{
 const f=fixture({state:'suspended',delayResume:true});f.audio.configure(true,1);
 const unlocking=f.audio.unlock();f.audio.stop();f.resume();assert.equal(await unlocking,false);
 assert.equal(f.audio.unlocked,false);assert.equal(f.audio.hit(),false);assert.equal(f.ctx.oscillators.length,0);f.audio.destroy();
});

test('muting and destruction silence all active nodes and reject future cues',async()=>{
 const f=fixture();f.audio.configure(true,1);await f.audio.unlock();f.audio.hit();f.audio.configure(false,1);
 assert.equal(f.audio.status,'off');assert.equal(f.ctx.oscillators.every(n=>!n.connected),true);assert.equal(f.audio.cue(),false);
 f.audio.configure(true,.5);f.advance(100);assert.equal(f.audio.hit(),true);f.audio.destroy();assert.equal(f.ctx.state,'closed');assert.equal(f.audio.hit(),false);assert.equal(await f.audio.unlock(),false);
});

test('sound completion cleans up the whole voice and independent tones have distinct spectra',async()=>{
 const f=fixture();f.audio.configure(true,.5);await f.audio.unlock();f.audio.hit();f.ctx.oscillators[0].onended();
 assert.equal(f.audio.voices.size,0);assert.equal(f.ctx.oscillators.every(n=>!n.connected),true);
 assert.equal(new Set(Object.values(MUYU_TONE_PROFILES).map(p=>p.frequencies.join(','))).size,3);f.audio.destroy();
});

test('unavailable audio support fails softly while muted startup stays inert',async()=>{
 const audio=new MuyuAudio({contextFactory:()=>null});assert.equal(await audio.unlock(),false);audio.configure(true,1);assert.equal(await audio.unlock(),false);assert.equal(audio.status,'error');assert.equal(audio.hit(),false);audio.destroy();
});
