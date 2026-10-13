import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {MuyuModel} from './model.js';
import {createMuyuStroke,createMuyuPressGesture} from './motion.js';
import {loadMuyu,saveMuyu} from './storage.js';
import {resolveMuyuEnvironment} from './environment.js';
import {MuyuRenderer} from './renderer.js';
import {MuyuAudio} from './audio.js';
import {renderScale,watchDeviceScale} from '../../engine/rendering.js';
import './theme.css';

const Scene=forwardRef(function MuyuScene({options,environment,desktop,panelOpen=false,onChange,notify},ref){
 const canvas=useRef(null),runtime=useRef(null),latest=useRef(null);
 latest.current={options,environment,desktop,panelOpen,onChange,notify};
 useEffect(()=>{
  const model=new MuyuModel(loadMuyu()),audio=new MuyuAudio();
  let dead=false,raf=0,lastDraw=0,lastPublish=0,lastSave=0,saveTimer=0,saveWarning=false,suspended=false,lastSize=null;
  let frames=0,fps=0,fpsAt=performance.now();
  const visual={stroke:null,hitAt:-Infinity,floats:[],beadsAt:-Infinity};
  const hidden=()=>document.hidden||latest.current.desktop?.visible===false||latest.current.desktop?.minimized===true;
  const blocked=()=>hidden()||latest.current.options.paused;
  const resolved=()=>resolveMuyuEnvironment(model.state.settings,latest.current.environment);
  const persist=()=>{clearTimeout(saveTimer);saveTimer=0;lastSave=performance.now();const ok=saveMuyu(model.snapshot());if(!ok&&!saveWarning){saveWarning=true;latest.current.notify('木鱼进度暂未保存，本机存储空间可能不足。')}if(ok)saveWarning=false;return ok};
  const saveSoon=()=>{if(!saveTimer)saveTimer=setTimeout(persist,300)};
  const sound=()=>audio.configure(!blocked()&&latest.current.options.sound&&model.state.settings.sound,(latest.current.options.volume??.18)*model.state.settings.volume);
  const publish=()=>{if(!dead)latest.current.onChange({...model.view(),resolved:resolved(),audioStatus:audio.status})};
  const renderer=new MuyuRenderer(canvas.current,message=>{if(dead)return;if(message)latest.current.notify(message);render()});
  const render=()=>{if(!dead&&!hidden())renderer.draw(model.view(),resolved(),latest.current.options,performance.now(),visual)};
  const events=()=>{
   let changed=false,hit=null;
   for(const event of model.events.splice(0)){
    if(event.type==='strike')visual.stroke=createMuyuStroke(visual.stroke,event,{reducedMotion:model.state.settings.reducedMotion||latest.current.options.reducedMotion});
    if(event.type==='hit'){
     const now=event.at??performance.now();visual.hitAt=now;hit=event;changed=true;
     if(model.state.settings.floatingText)visual.floats.push({id:event.id,text:event.text,at:now});
     visual.floats=visual.floats.slice(-12);
    }
    if(event.type==='focusComplete'){visual.stroke=null;changed=true;audio.cue('complete');latest.current.notify('这段静念结束了，舒展一下肩膀吧。')}
   }
   // Every impact is counted by the model. Simultaneous inputs share one sound
   // voice for this display frame, rather than accumulating an audible backlog.
   if(hit)audio.hit(hit.tone||model.state.settings.tone);
   if(changed){saveSoon();publish()}
  };
  const command=(action,payload)=>{
   if(dead)return {ok:false};
   if(blocked()&&['auto','focusStart','focusResume'].includes(action)&&payload!==false){latest.current.notify('先恢复当前场景，再开始。');return {ok:false,message:'先恢复当前场景，再开始。'}}
   sound();audio.unlock();
   const result=model.command(action,payload,performance.now());
   if(result?.ok&&(action==='auto'&&payload===false||['focusStart','focusPause','focusEnd'].includes(action)))visual.stroke=null;
   events();
   if(result?.ok){sound();saveSoon();publish();render()}
   if(result?.message)latest.current.notify(result.message);
   return result;
  };
  const strike=()=>{
   if(blocked()||latest.current.panelOpen||dead)return false;
   sound();audio.unlock();const accepted=model.requestStrike('manual',performance.now());events();publish();render();return accepted;
  };
  const activate=hit=>{
   if(!hit||blocked()||latest.current.panelOpen)return;
   if(hit==='wood')return strike();
   sound();audio.unlock();
   if(hit==='incense')command('settings',{smoke:!model.state.settings.smoke});
   if(hit==='lamp')command('settings',{lights:resolved().lights?'off':'on'});
   if(hit==='beads'){visual.beadsAt=performance.now();const generation=audio.generation;audio.unlock().then(ready=>{if(ready&&!dead&&!blocked()&&audio.generation===generation)audio.cue('beads')});render()}
  };
  const usable=(x,y)=>!blocked()&&!latest.current.panelOpen&&document.elementFromPoint(x,y)===canvas.current;
  const press=createMuyuPressGesture({usable,hitAt:(x,y)=>renderer.hit(renderer.world(x,y)),focusWood:()=>canvas.current.focus({preventScroll:true}),activate});
  const pointerDown=e=>press.down(e);
  const pointerUp=e=>press.up(e);
  const key=e=>{
   if(e.code!=='Space'||e.repeat||e.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.target!==canvas.current||document.activeElement!==canvas.current||!document.hasFocus()||latest.current.desktop?.desktopMode||latest.current.panelOpen||blocked())return;
   e.preventDefault();e.stopPropagation();strike();
  };
  const resize=()=>{if(dead)return;const b=canvas.current.getBoundingClientRect(),o=latest.current.options,scale=renderScale(b.width,b.height,devicePixelRatio||1,o.quality,o.desktopMode,latest.current.desktop?.display?.scaleFactor);const size=[b.width,b.height,scale];if(lastSize&&size.every((value,i)=>value===lastSize[i]))return;lastSize=size;press.cancel();renderer.resize(...size);render()};
  const tick=now=>{
   raf=0;if(dead||blocked())return;
   const interval=latest.current.options.quality==='low'?1000/30:1000/60;
   if(!lastDraw||now-lastDraw>=interval-1){
    model.tick(now,Date.now());sound();events();visual.floats=visual.floats.filter(p=>now-p.at<2200);render();lastDraw=now;frames++;
    if(now-fpsAt>=1000){fps=Math.round(frames*1000/(now-fpsAt));frames=0;fpsAt=now}
    if(now-lastPublish>250){publish();lastPublish=now}
    if(model.state.focus.status==='running'&&now-lastSave>5000)persist();
   }
   raf=requestAnimationFrame(tick);
  };
  const schedule=()=>{if(!dead&&!blocked()&&!raf)raf=requestAnimationFrame(tick)};
  const suspend=()=>{press.cancel();model.suspend();visual.stroke=null;visual.floats=[];visual.hitAt=-Infinity;model.events.splice(0);cancelAnimationFrame(raf);raf=0;audio.stop();persist();publish();render()};
  const lifecycle=()=>{const next=blocked();if(next&&!suspended)suspend();suspended=next;if(!next){sound();schedule();render();publish()}};
  const visibility=()=>{if(hidden())suspend();suspended=blocked();if(!suspended){sound();schedule();publish()}};
  const pagehide=()=>suspend();
  const blur=()=>press.cancel();
  const observer=new ResizeObserver(resize);observer.observe(canvas.current);const unwatch=watchDeviceScale(resize);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('blur',blur);
  const off=window.pondDesktop?.onPointer(event=>{
   if(event.type==='feed'&&latest.current.desktop?.desktopMode&&latest.current.desktop.globalInteraction&&!blocked()&&!latest.current.panelOpen)activate(renderer.hit(renderer.world(event.x,event.y)));
  });
  runtime.current={command,strike,pointerDown,pointerUp,key,resize,lifecycle,cancel:()=>press.cancel(),
   move:e=>{if(!blocked())canvas.current.style.cursor=renderer.hit(renderer.world(e.clientX,e.clientY))?'pointer':''},
   previewSound:async tone=>{sound();if(!latest.current.options.sound||!model.state.settings.sound||latest.current.options.volume<=0||model.state.settings.volume<=0){latest.current.notify('请先在设置中开启木鱼声音，并调高一点音量。');return false}const generation=audio.generation;if(await audio.unlock()&&!dead&&!blocked()&&audio.generation===generation)return audio.hit(tone||model.state.settings.tone);return false},
   stats:()=>({...renderer.stats(),fps:blocked()?0:fps,desktopMode:!!latest.current.options.desktopMode,autoEnabled:model.autoEnabled,pendingHits:model._pending.length,focus:model.state.focus.status})};
  resize();publish();persist();lifecycle();
  return()=>{dead=true;suspend();clearTimeout(saveTimer);cancelAnimationFrame(raf);observer.disconnect();unwatch?.();off?.();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('blur',blur);audio.destroy();renderer.destroy();runtime.current=null};
 },[]);
 useEffect(()=>{runtime.current?.lifecycle()},[options,environment,desktop?.visible,desktop?.minimized]);
 useEffect(()=>{runtime.current?.resize()},[options.quality,options.desktopMode,desktop?.display?.scaleFactor]);
 useEffect(()=>{if(panelOpen)runtime.current?.cancel()},[panelOpen]);
 useImperativeHandle(ref,()=>({command:(a,p)=>runtime.current?.command(a,p),previewSound:t=>runtime.current?.previewSound(t),stats:()=>runtime.current?.stats(),feed:()=>latest.current.notify('轻点木鱼，或先让木鱼获得焦点再按空格。')}),[]);
 return <div className="muyu-stage"><canvas ref={canvas} className="pond-canvas muyu-canvas" tabIndex={0} aria-label="电子木鱼，轻点木鱼或在此获得焦点后按空格敲击" onPointerDown={e=>runtime.current?.pointerDown(e)} onPointerUp={e=>runtime.current?.pointerUp(e)} onPointerMove={e=>runtime.current?.move(e)} onPointerCancel={()=>runtime.current?.cancel()} onPointerLeave={()=>runtime.current?.cancel()} onKeyDown={e=>runtime.current?.key(e)} onContextMenu={e=>e.preventDefault()}/></div>;
});
export default Scene;
