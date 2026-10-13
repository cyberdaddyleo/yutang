import {DEFAULT_SETTINGS,SKINS,TONES,PHRASE_GROUPS,INTERVALS,FOCUS_MINUTES} from './catalog.js';
import {MUYU_CONTACT_MS} from './motion.js';

export const IMPACT_DELAY_MS=MUYU_CONTACT_MS;
export const MAX_PENDING_STRIKES=512;
const MAX_COUNT=Number.MAX_SAFE_INTEGER;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clamp=(value,min,max,fallback=min)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const count=value=>Math.floor(clamp(value,0,MAX_COUNT));
const enumValue=(value,choices,fallback)=>choices.includes(value)?value:fallback;
const bool=(value,fallback)=>typeof value==='boolean'?value:fallback;
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function splitGraphemes(value){const text=typeof value==='string'?value:'';return segmenter?Array.from(segmenter.segment(text),part=>part.segment):Array.from(text);}
export function sanitizePhrase(value){return splitGraphemes(typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim():'').slice(0,12).join('');}
export function normalizeCustomPhrases(value){return (Array.isArray(value)?value:typeof value==='string'?value.split(/\r?\n/):[]).slice(0,100).map(sanitizePhrase).filter(Boolean).slice(0,20);}
export function localDay(now=Date.now()) {
  const date=new Date(now);if(!Number.isFinite(date.getTime()))return localDay(Date.now());
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function normalizeSettings(raw={}) {
  const value=record(raw)?raw:{},d=DEFAULT_SETTINGS;
  return {
    skin:enumValue(value.skin,SKINS.map(s=>s.id),d.skin),tone:enumValue(value.tone,TONES.map(t=>t.id),d.tone),
    interval:enumValue(value.interval,INTERVALS,d.interval),phraseMode:enumValue(value.phraseMode,['fixed','random','sequence','custom'],d.phraseMode),
    phraseGroup:enumValue(value.phraseGroup,PHRASE_GROUPS.map(g=>g.id),d.phraseGroup),fixedPhrase:sanitizePhrase(value.fixedPhrase)||d.fixedPhrase,
    customPhrases:normalizeCustomPhrases(value.customPhrases),textDirection:enumValue(value.textDirection,['horizontal','vertical'],d.textDirection),
    textColor:typeof value.textColor==='string'&&/^#[a-f\d]{6}$/i.test(value.textColor)?value.textColor:d.textColor,
    textSize:Math.round(clamp(value.textSize,18,64,d.textSize)),floatingText:bool(value.floatingText,d.floatingText),reducedMotion:bool(value.reducedMotion,d.reducedMotion),
    sound:bool(value.sound,d.sound),volume:clamp(value.volume,0,1,d.volume),
    season:enumValue(value.season,['auto','spring','summer','autumn','winter'],d.season),time:enumValue(value.time,['auto','dawn','day','dusk','night'],d.time),
    lights:enumValue(value.lights,['auto','on','off'],d.lights),smoke:bool(value.smoke,d.smoke),
  };
}
export function normalizeMuyu(raw,wallNow=Date.now()) {
  const value=record(raw)?raw:{},s=record(value.stats)?value.stats:{},f=record(value.focus)?value.focus:{};
  const auto=count(s.auto),manual=Number.isFinite(s.manual)?count(s.manual):Math.max(0,count(s.total)-auto);
  const total=Math.min(MAX_COUNT,Math.max(count(s.total),manual+auto));
  const durationMs=FOCUS_MINUTES.map(minutes=>minutes*60000).includes(f.durationMs)?f.durationMs:25*60000;
  const remainingMs=clamp(f.remainingMs,0,durationMs,durationMs);
  let status=enumValue(f.status,['idle','running','paused','complete','ended'],'idle');
  if(status==='running')status='paused';
  if(status==='complete'||remainingMs===0)status='complete';
  return {version:1,settings:normalizeSettings(value.settings),stats:{day:localDay(wallNow),today:s.day===localDay(wallNow)?Math.min(total,count(s.today)):0,total,manual,auto},
    focus:{status,durationMs,remainingMs:status==='complete'?0:remainingMs,mode:enumValue(f.mode,['manual','auto','ambient'],'manual')}};
}

/** One active renderer clock drives all timing. There are no timers or offline updates. */
export class MuyuModel {
  constructor(raw,{random=Math.random,now=Date.now}={}) {
    this._random=typeof random==='function'?random:Math.random;
    this._wallNow=typeof now==='function'?now:()=>Number.isFinite(now)?now:Date.now();
    this.state=normalizeMuyu(raw,this._wallNow());this.autoEnabled=false;this.lastStrikeAt=-Infinity;this.events=[];
    this._pending=[];this._stroke=null;this._lastTick=null;this._nextAutoAt=null;this._id=0;this._phraseIndex=0;
  }
  _time(value){return Number.isFinite(value)?value:globalThis.performance?.now?.()??0;}
  _emit(event){if(this.events.length>=2048)this.events.splice(0,this.events.length-2047);this.events.push(event);}
  _stopAuto(){this.autoEnabled=false;this._nextAutoAt=null;this._pending=this._pending.filter(strike=>strike.source!=='auto');this.events=this.events.filter(event=>event.source!=='auto');if(this._stroke?.source==='auto')this._stroke=null;}
  _startAuto(now){this.autoEnabled=true;this._nextAutoAt=now+this.state.settings.interval*1000;this._lastTick=now;}
  _updateDay(wallNow){const day=localDay(wallNow);if(this.state.stats.day!==day){this.state.stats.day=day;this.state.stats.today=0;}}
  _phrase(){
    const s=this.state.settings,group=PHRASE_GROUPS.find(g=>g.id===s.phraseGroup)||PHRASE_GROUPS[0];
    if(s.phraseMode==='fixed')return s.fixedPhrase;
    const list=s.phraseMode==='custom'?(s.customPhrases.length?s.customPhrases:[s.fixedPhrase]):group.phrases;
    if(s.phraseMode==='random'){const sample=clamp(this._random(),0,.999999999,0);return list[Math.floor(sample*list.length)];}
    const phrase=list[this._phraseIndex%list.length];this._phraseIndex++;return phrase;
  }
  requestStrike(source='manual',nowMs) {
    if(!['manual','auto'].includes(source))return false;
    if(this.state.focus.status==='running'&&this.state.focus.mode==='ambient')return false;
    if(source==='manual')this._stopAuto();
    else if(!this.autoEnabled)return false;
    if(this._pending.length>=MAX_PENDING_STRIKES)return false;
    const now=this._time(nowMs);if(this._lastTick===null)this._lastTick=now;
    const id=++this._id;
    // Rapid presses join the descending mallet's next contact instead of
    // resetting its animation or adding a later audible/visual queue.
    if(!this._stroke||this._stroke.source!==source||now>=this._stroke.impactAt)this._stroke={id,source,at:now,impactAt:now+IMPACT_DELAY_MS};
    const stroke=this._stroke,strike={id,strokeId:stroke.id,source,due:stroke.impactAt,tone:this.state.settings.tone};
    this._pending.push(strike);this.lastStrikeAt=stroke.at;
    this._emit({type:'strike',id,strokeId:stroke.id,source,at:stroke.at,impactAt:stroke.impactAt});return true;
  }
  tick(nowMs,wallNow=this._wallNow()) {
    const now=this._time(nowMs);this._updateDay(wallNow);
    if(this._lastTick===null){this._lastTick=now;return;}
    const dt=now-this._lastTick;this._lastTick=now;
    // Sleep / clock resets discard unresolved impacts, rather than replaying a backlog.
    if(dt<0||dt>1000){this.suspend();return;}
    const focus=this.state.focus;
    if(focus.status==='running'){
      focus.remainingMs=Math.max(0,focus.remainingMs-dt);
      if(focus.remainingMs===0){focus.status='complete';this._stopAuto();this._emit({type:'focusComplete',at:now});}
    }
    const due=this._pending.filter(strike=>strike.due<=now);
    this._pending=this._pending.filter(strike=>strike.due>now);
    for(const strike of due){
      if(strike.source==='auto'&&!this.autoEnabled)continue;
      const stats=this.state.stats;stats.total=Math.min(MAX_COUNT,stats.total+1);stats.today=Math.min(MAX_COUNT,stats.today+1);stats[strike.source]=Math.min(MAX_COUNT,stats[strike.source]+1);
      this._emit({type:'hit',id:strike.id,source:strike.source,text:this._phrase(),tone:strike.tone,at:strike.due,processedAt:now,strokeId:strike.strokeId});
    }
    // At most one automatic input per tick; never try to catch up missed intervals.
    if(this.autoEnabled&&this._nextAutoAt!==null&&now>=this._nextAutoAt){
      this.requestStrike('auto',now);this._nextAutoAt=now+this.state.settings.interval*1000;
    }
  }
  suspend(){this._stopAuto();this._pending=[];this._stroke=null;this.events=[];this._lastTick=null;if(this.state.focus.status==='running')this.state.focus.status='paused';}
  command(action,payload,nowMs) {
    const now=this._time(nowMs),focus=this.state.focus;
    if(action==='settings'){
      if(!record(payload))return {ok:false,message:'设置格式不正确'};
      const old=this.state.settings;this.state.settings=normalizeSettings({...old,...payload});
      if(['phraseMode','phraseGroup','customPhrases'].some(key=>Object.hasOwn(payload,key)))this._phraseIndex=0;
      if(this.autoEnabled&&old.interval!==this.state.settings.interval)this._nextAutoAt=now+this.state.settings.interval*1000;
      return {ok:true};
    }
    if(action==='auto'){
      if(typeof payload!=='boolean')return {ok:false,message:'请选择开始或停止'};
      if(!payload){this._stopAuto();return {ok:true};}
      if(focus.status==='running'&&focus.mode!=='auto')return {ok:false,message:focus.mode==='ambient'?'环境陪伴中不自动敲击':'当前专注为手动敲击'};
      this._startAuto(now);return {ok:true};
    }
    if(action==='focusStart'){
      if(!record(payload)||!FOCUS_MINUTES.includes(payload.minutes)||!['manual','auto','ambient'].includes(payload.mode))return {ok:false,message:'请选择专注时长和方式'};
      this._stopAuto();this._pending=[];this._stroke=null;this.state.focus={status:'running',durationMs:payload.minutes*60000,remainingMs:payload.minutes*60000,mode:payload.mode};this._lastTick=now;
      if(payload.mode==='auto')this._startAuto(now);return {ok:true};
    }
    if(action==='focusPause'){
      if(focus.status!=='running')return {ok:false,message:'没有正在进行的专注'};
      this.suspend();return {ok:true};
    }
    if(action==='focusResume'){
      if(focus.status!=='paused'||focus.remainingMs<=0)return {ok:false,message:'没有可继续的专注'};
      focus.status='running';this._lastTick=now;if(focus.mode==='auto')this._startAuto(now);return {ok:true};
    }
    if(action==='focusEnd'){
      this._stopAuto();this._pending=[];this._stroke=null;focus.status='ended';this._lastTick=now;return {ok:true};
    }
    return {ok:false,message:'未知操作'};
  }
  snapshot(){const state=structuredClone(this.state);if(state.focus.status==='running')state.focus.status='paused';return state;}
  view(){return {...this.state,autoEnabled:this.autoEnabled};}
}
