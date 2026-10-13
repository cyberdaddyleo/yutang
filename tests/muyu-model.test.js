import test from 'node:test';
import assert from 'node:assert/strict';
import {MuyuModel,IMPACT_DELAY_MS,MAX_PENDING_STRIKES,normalizeMuyu,splitGraphemes,sanitizePhrase,normalizeCustomPhrases,localDay} from '../src/themes/muyu/model.js';
import {PHRASE_GROUPS,SKINS,INTERVALS,FOCUS_MINUTES,STORE_KEY} from '../src/themes/muyu/catalog.js';
import {resolveMuyuEnvironment} from '../src/themes/muyu/environment.js';
import {loadMuyu,saveMuyu} from '../src/themes/muyu/storage.js';
const wall=new Date(2026,9,13,12).getTime();
const make=raw=>new MuyuModel(raw,{now:()=>wall,random:()=>.6});
const hits=model=>model.events.filter(event=>event.type==='hit');
const strike=(model,at=0)=>{assert.equal(model.requestStrike('manual',at),true);model.tick(at+100,wall);};

test('new theme is quiet, manual, independent, with requested defaults and all catalog choices',()=>{
 const m=make();assert.equal(m.autoEnabled,false);assert.equal(m.state.settings.skin,'walnut');assert.equal(m.state.settings.fixedPhrase,'功德+1');assert.equal(m.state.settings.time,'auto');assert.equal(m.state.focus.status,'idle');assert.equal(m.state.stats.total,0);
 assert.deepEqual(INTERVALS,[.5,1,2,3]);assert.deepEqual(FOCUS_MINUTES,[5,15,25,45]);assert.equal(SKINS.length,8);assert.equal(new Set(SKINS.map(s=>s.id)).size,8);assert.equal(PHRASE_GROUPS.length,6);assert.equal(PHRASE_GROUPS.flatMap(g=>g.phrases).length,24);
 m.tick(0,wall);m.tick(900,wall);assert.equal(hits(m).length,0);
});
test('100 rapid accepted manual inputs create 100 unique impacts, never 99 or 101',()=>{
 const m=make();for(let i=0;i<100;i++)assert.equal(m.requestStrike('manual',0),true);
 assert.equal(m.state.stats.total,0);m.tick(IMPACT_DELAY_MS-1,wall);assert.equal(m.state.stats.total,0);
 m.tick(IMPACT_DELAY_MS,wall);assert.deepEqual(m.state.stats,{day:localDay(wall),today:100,total:100,manual:100,auto:0});
 assert.equal(hits(m).length,100);assert.equal(new Set(hits(m).map(e=>e.id)).size,100);m.tick(800,wall);assert.equal(m.state.stats.total,100);
});
test('rapid inputs are concurrent and bounded, not replayed as a serial backlog',()=>{
 const m=make();for(let i=0;i<MAX_PENDING_STRIKES;i++)assert.equal(m.requestStrike('manual',0),true);
 assert.equal(m.requestStrike('manual',0),false);m.tick(100,wall);assert.equal(m.state.stats.total,MAX_PENDING_STRIKES);m.events.splice(0);m.tick(1000,wall);assert.equal(hits(m).length,0);
});
test('automatic intervals use one due input per frame and count only after contact',()=>{
 const m=make();m.command('auto',true,0);m.tick(999,wall);assert.equal(m.events.length,0);m.tick(1000,wall);assert.equal(m.state.stats.auto,0);m.tick(1099,wall);assert.equal(m.state.stats.auto,0);m.tick(1100,wall);assert.equal(m.state.stats.auto,1);m.tick(2000,wall);m.tick(2100,wall);assert.equal(m.state.stats.auto,2);
});
test('stopping auto during the mallet approach cancels that impact',()=>{
 const m=make();m.command('auto',true,0);m.tick(1000,wall);m.command('auto',false,1050);m.tick(1100,wall);assert.equal(m.state.stats.total,0);assert.equal(m.autoEnabled,false);assert.equal(m.events.filter(e=>e.source==='auto').length,0);
 for(let t=2000;t<=5000;t+=1000)m.tick(t,wall);assert.equal(m.state.stats.total,0);
});
test('manual input first stops auto, then produces exactly one manual hit',()=>{
 const m=make();m.command('auto',true,0);m.tick(1000,wall);assert.equal(m.requestStrike('manual',1050),true);m.tick(1150,wall);assert.equal(m.autoEnabled,false);assert.equal(m.state.stats.auto,0);assert.equal(m.state.stats.manual,1);assert.equal(hits(m).length,1);
});
test('half-second auto never catches up multiple missed intervals within one frame',()=>{
 const m=make();m.command('settings',{interval:.5},0);m.command('auto',true,0);m.tick(900,wall);assert.equal(m.events.filter(e=>e.type==='strike').length,1);m.tick(1000,wall);assert.equal(m.state.stats.auto,1);
});
test('suspend, backwards monotonic clock and >1s gap cancel sound/impacts and pause focus',()=>{
 for(const trigger of [m=>m.suspend(),m=>m.tick(1200,wall),m=>m.tick(-1,wall)]){
  const m=make();m.command('focusStart',{minutes:5,mode:'auto'},0);m.requestStrike('manual',0);trigger(m);assert.equal(m.autoEnabled,false);assert.equal(m.state.focus.status,'paused');assert.equal(m.state.stats.total,0);assert.equal(m.events.length,0);m.tick(999999,wall+999999);m.tick(1000000,wall+1000000);assert.equal(m.state.stats.total,0);assert.equal(m.state.focus.remainingMs,300000);
 }
});
test('reload keeps all counters/preferences but never resumes auto or focus or resolves pending input',()=>{
 const m=make();m.command('settings',{skin:'jade',customPhrases:['平安'],textDirection:'vertical'},0);strike(m,0);m.command('focusStart',{minutes:15,mode:'auto'},100);m.tick(600,wall);m.requestStrike('manual',650);
 const snapshot=m.snapshot(),restored=make(snapshot);assert.equal(snapshot.focus.status,'paused');assert.equal(m.state.focus.status,'running');assert.equal(restored.state.focus.remainingMs,899500);assert.equal(restored.autoEnabled,false);assert.equal(restored.state.settings.skin,'jade');assert.equal(restored.state.stats.total,1);restored.tick(10000000,wall+10000000);assert.equal(restored.state.stats.total,1);assert.equal(restored.state.focus.remainingMs,899500);
});
test('each focus mode starts correctly; ambient rejects hits and auto, pause/resume is explicit',()=>{
 for(const mode of ['manual','auto','ambient']){
  const m=make();assert.equal(m.command('focusStart',{minutes:5,mode},0).ok,true);assert.equal(m.autoEnabled,mode==='auto');m.tick(500,wall);assert.equal(m.state.focus.remainingMs,299500);
  if(mode==='ambient'){assert.equal(m.requestStrike('manual',500),false);assert.equal(m.command('auto',true,500).ok,false);}
  m.command('focusPause',null,500);assert.equal(m.autoEnabled,false);m.tick(5000,wall);assert.equal(m.state.focus.remainingMs,299500);assert.equal(m.command('focusResume',null,5000).ok,true);assert.equal(m.autoEnabled,mode==='auto');m.tick(5500,wall);assert.equal(m.state.focus.remainingMs,299000);
  m.command('focusEnd',null,5500);m.tick(6000,wall);assert.equal(m.state.focus.status,'ended');assert.equal(m.state.focus.remainingMs,299000);assert.equal(m.autoEnabled,false);
 }
});
test('focus completes once using active elapsed time, stops auto and cancels last automatic approach',()=>{
 const m=make();m.command('focusStart',{minutes:5,mode:'auto'},0);for(let t=500;t<=300000;t+=500)m.tick(t,wall+t);
 assert.equal(m.state.focus.remainingMs,0);assert.equal(m.state.focus.status,'complete');assert.equal(m.autoEnabled,false);assert.equal(m.events.filter(e=>e.type==='focusComplete').length,1);const total=m.state.stats.total;m.tick(300500,wall+300500);assert.equal(m.state.stats.total,total);assert.equal(m.events.filter(e=>e.type==='focusComplete').length,1);
});
test('fixed/random/sequence/custom are display-only and custom list cycles in written order',()=>{
 const m=make();m.command('settings',{floatingText:false,phraseMode:'sequence',phraseGroup:'calm'},0);
 for(let t=0;t<500;t+=100)strike(m,t);assert.deepEqual(hits(m).map(h=>h.text),['莫生气','放轻松','不着急','深呼吸','莫生气']);assert.equal(m.state.stats.total,5);
 m.events=[];m.command('settings',{phraseMode:'custom',customPhrases:['一','二']},500);strike(m,500);strike(m,600);strike(m,700);assert.deepEqual(hits(m).map(h=>h.text),['一','二','一']);
 m.command('settings',{phraseMode:'random',phraseGroup:'work'},800);strike(m,800);assert.equal(hits(m).at(-1).text,'准时下班');
 m.command('settings',{phraseMode:'fixed',fixedPhrase:'<b>福</b>'},900);strike(m,900);assert.equal(hits(m).at(-1).text,'<b>福</b>');assert.equal(m.state.stats.total,10);
});
test('custom text limits count visible graphemes, preserve plain text, discard controls and cap20',()=>{
 const grapheme='👩🏽‍💻';assert.equal(splitGraphemes(grapheme).length,1);assert.equal(splitGraphemes(sanitizePhrase(grapheme.repeat(15))).length,12);
 assert.equal(sanitizePhrase(' \u0000平安\n喜乐\u202e '),'平安喜乐');assert.equal(sanitizePhrase('<img src=x>'),'<img src=x>');assert.equal(normalizeCustomPhrases('一\n\n二').length,2);assert.equal(normalizeCustomPhrases(Array(50).fill('心安')).length,20);
});
test('skin/tone changes are independent and preserve text/statistics/running focus',()=>{
 const m=make();strike(m);m.command('focusStart',{minutes:25,mode:'manual'},100);m.command('settings',{skin:'gold'},200);assert.equal(m.state.settings.tone,'wood');assert.equal(m.state.stats.total,1);assert.equal(m.state.focus.status,'running');assert.equal(m.state.settings.fixedPhrase,'功德+1');m.command('settings',{tone:'clear'},200);assert.equal(m.state.settings.skin,'gold');
});
test('local midnight resets only today; lifetime counters survive backwards/forward wall jumps',()=>{
 const m=make();strike(m);const tomorrow=new Date(2026,9,14,0).getTime();m.tick(200,tomorrow);assert.equal(m.state.stats.today,0);assert.equal(m.state.stats.total,1);m.requestStrike('manual',200);m.tick(300,tomorrow);assert.equal(m.state.stats.today,1);assert.equal(m.state.stats.total,2);m.tick(400,wall);assert.equal(m.state.stats.today,0);assert.equal(m.state.stats.total,2);
});
test('corrupt/partial data repairs only this state without accepting invalid settings or nonfinite counters',()=>{
 const source={settings:{skin:'missing',interval:0,volume:Infinity,textColor:'red;display:none',customPhrases:[null,3,'好']},stats:{total:-5,manual:NaN,auto:Infinity,today:100,day:localDay(wall)},focus:{status:'running',durationMs:Infinity,remainingMs:-100,mode:'bad'}};
 const repaired=normalizeMuyu(source,wall);assert.equal(repaired.settings.skin,'walnut');assert.equal(repaired.settings.interval,1);assert.equal(repaired.settings.volume,1);assert.equal(repaired.stats.total,0);assert.equal(repaired.stats.today,0);assert.equal(repaired.focus.status,'complete');assert.deepEqual(repaired.settings.customPhrases,['好']);assert.equal(source.settings.skin,'missing');
 for(const raw of [null,[],42,'bad'])assert.equal(normalizeMuyu(raw,wall).settings.skin,'walnut');
});
test('settings/focus commands reject invalid actions instead of starting arbitrary timers',()=>{
 const m=make();assert.equal(m.command('focusStart',{minutes:1,mode:'auto'},0).ok,false);assert.equal(m.command('auto','true',0).ok,false);assert.equal(m.command('focusResume',null,0).ok,false);assert.equal(m.command('settings',null,0).ok,false);assert.equal(m.command('wat',{},0).ok,false);assert.equal(m.autoEnabled,false);assert.equal(m.state.focus.status,'idle');
});
test('local season and time override app only in this theme; dawn/day/night have correct lights',()=>{
 const app={season:'winter',night:false,now:new Date(2026,4,1,12)};assert.deepEqual(resolveMuyuEnvironment({},app),{season:'winter',time:'day',night:false,lights:false});
 assert.deepEqual(resolveMuyuEnvironment({season:'spring',time:'night',lights:'off'},app),{season:'spring',time:'night',night:true,lights:false});assert.equal(app.season,'winter');assert.equal(app.night,false);
 assert.equal(resolveMuyuEnvironment({time:'dawn'},app).lights,false);assert.equal(resolveMuyuEnvironment({time:'dusk'},app).lights,true);assert.equal(resolveMuyuEnvironment({time:'day',lights:'on'},app).lights,true);assert.equal(resolveMuyuEnvironment({}, {},new Date(2026,6,10,6)).season,'summer');assert.equal(resolveMuyuEnvironment({}, {},new Date(2026,6,10,6)).time,'dawn');
});
test('store writes only the new namespace and malformed JSON is isolated',()=>{
 const previous=globalThis.localStorage,data=new Map([['mofish-cats-v1','{"cats":[1]}'],['fusheng-settings','{"season":"winter"}']]);globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 try{assert.equal(saveMuyu(make().snapshot()),true);assert.equal(loadMuyu().settings.skin,'walnut');assert.equal(data.get('mofish-cats-v1'),'{"cats":[1]}');assert.equal(data.get('fusheng-settings'),'{"season":"winter"}');data.set(STORE_KEY,'bad-json');assert.equal(loadMuyu(),null);assert.equal(data.size,3);}finally{globalThis.localStorage=previous;}
});
