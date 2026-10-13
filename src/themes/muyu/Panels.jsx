import {useState} from 'react';
import {Play,Pause,Square,Type,Palette,Flame,Leaf,Settings,Volume2,Check,RefreshCw,Sunrise,Sun,Sunset,Moon} from 'lucide-react';
import {Panel,Toggle} from '../../components/Panel.jsx';
import {SKINS,TONES,PHRASE_GROUPS,INTERVALS,FOCUS_MINUTES} from './catalog.js';
import {splitGraphemes} from './model.js';

const set=(api,patch)=>api()?.command('settings',patch);
const formatTime=ms=>{const seconds=Math.ceil(Math.max(0,ms)/1000);return`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`};
const materialNotes={walnut:'温润木纹 · 柔和磨光',ebony:'细密黑檀 · 内敛木光',jade:'温白玉质 · 通透柔光',celadon:'青瓷釉面 · 温润开片',lacquer:'朱红漆面 · 细腻润泽',gold:'鎏金莲纹 · 金属光泽',bamboo:'竹片肌理 · 清浅纹路',clay:'暖陶质地 · 朴素哑光'};

function Choices({label,items,value,onChange,className=''}){return <div className={`muyu-choices ${className}`} role="group" aria-label={label}>{items.map(([id,name,Icon])=><button key={id} type="button" aria-pressed={value===id} onClick={()=>onChange(id)}>{Icon&&<Icon size={16}/>}<span>{name}</span></button>)}</div>}

export function MuyuDock({panel,setPanel,view}){return <>{[
 ['auto','自动',Play],['text','愿想',Type],['skins','材质',Palette],['focus','静念',Flame],['environment','环境',Leaf],['settings','设置',Settings]
 ].map(([id,name,Icon])=>{const target=id==='settings'?id:`muyu-${id}`;return <button key={id} className={panel===target?'active':''} onClick={()=>setPanel(panel===target?null:target)}><Icon/><span>{name}{id==='auto'&&view?.autoEnabled?' · 开':''}</span></button>})}</>}

function Automatic({view,api}){const blocked=view.focus.status==='running'&&view.focus.mode!=='auto';return <>
 <div className="muyu-summary"><strong>{view.autoEnabled?'木鱼正轻轻敲着':'留一点，自己的节奏'}</strong><p>每次敲击都会计数。想自己敲时，轻点木鱼便会先停下自动。</p></div>
 <p className="muyu-eyebrow">敲击间隔</p>
 <Choices label="自动敲击间隔" items={INTERVALS.map(n=>[n,`${n} 秒`])} value={view.settings.interval} onChange={interval=>set(api,{interval})}/>
 <div className="muyu-buttons"><button className="primary-button" disabled={blocked} onClick={()=>api()?.command('auto',!view.autoEnabled)}>{view.autoEnabled?<Pause size={16}/>:<Play size={16}/>} {view.autoEnabled?'停止自动敲击':'开始自动敲击'}</button></div>
 {blocked&&<p className="inline-note">{view.focus.mode==='ambient'?'正在仅环境陪伴的静念时段。':'当前静念选择了手动敲击。'}结束静念后，可以重新开启自动。</p>}
 <p className="inline-note">切换主题、窗口休眠或重新打开程序后，自动会保持关闭，不会补敲。</p>
 </>}

function TextControls({view,api}){
 const settings=view.settings,[draft,setDraft]=useState(()=>settings.customPhrases.join('\n')),[saved,setSaved]=useState(false);
 const group=PHRASE_GROUPS.find(g=>g.id===settings.phraseGroup)||PHRASE_GROUPS[0];
 const lines=draft.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),longLines=lines.flatMap((line,i)=>splitGraphemes(line).length>12?[i+1]:[]),valid=lines.length>0&&lines.length<=20&&longLines.length===0;
 const preview=settings.phraseMode==='custom'?(lines[0]||'写一句，慢慢来'):settings.phraseMode==='fixed'?settings.fixedPhrase:group.phrases[0];
 function save(e){e.preventDefault();if(!valid)return;const result=api()?.command('settings',{customPhrases:lines,phraseMode:'custom'});setSaved(result?.ok===true)}
 return <>
  <Choices label="飘字模式" items={[["fixed","固定"],["random","随机"],["sequence","顺序"],["custom","自定义列表"]]} value={settings.phraseMode} onChange={phraseMode=>set(api,{phraseMode})}/>
  {settings.phraseMode!=='custom'?<>
   <p className="muyu-eyebrow">选一组喜欢的话</p>
   <Choices label="预设愿想组" className="muyu-three-cols" items={PHRASE_GROUPS.map(g=>[g.id,g.name])} value={settings.phraseGroup} onChange={phraseGroup=>{const next=PHRASE_GROUPS.find(g=>g.id===phraseGroup);set(api,{phraseGroup,...(settings.phraseMode==='fixed'?{fixedPhrase:next.phrases[0]}:{})})}}/>
   <div className="muyu-phrase-list">{group.phrases.map(phrase=>settings.phraseMode==='fixed'?<button key={phrase} aria-pressed={settings.fixedPhrase===phrase} onClick={()=>set(api,{fixedPhrase:phrase})}>{phrase}</button>:<span key={phrase}>{phrase}</span>)}</div>
   <p className="inline-note">{settings.phraseMode==='fixed'?'每次显示选中的一句。':settings.phraseMode==='random'?'从当前组中随机显示一句。':'按当前组的顺序轮流显示。'}</p>
  </>:<form onSubmit={save} className="muyu-custom-form">
   <label htmlFor="muyu-custom-phrases">每行一句，按顺序轮流显示</label>
   <textarea id="muyu-custom-phrases" aria-label="自定义敲击愿想" rows={6} maxLength={2000} spellCheck={false} value={draft} placeholder={'功德+1\n工资+1\n莫生气'} onChange={e=>{setDraft(e.target.value);setSaved(false)}}/>
   <p className="muyu-field-meta">{lines.length} / 20 条 · 每条最多 12 个可见字符</p>
   {lines.length>20&&<p className="muyu-validation" role="status">最多保存 20 条，请删去多出的愿想。</p>}
   {longLines.length>0&&<p className="muyu-validation" role="status">第 {longLines.join('、')} 条超过 12 个可见字符，请缩短后保存。</p>}
   <button type="submit" className="primary-button" disabled={!valid}><Check size={16}/>保存自定义列表</button>
   <span className="muyu-save-message" role="status">{saved?'已保存，下次敲击生效':''}</span>
  </form>}
  <div className="section-divider"/>
  <Toggle label="显示飘字" description="文字只是一句心意，所有愿想都按一次敲击记一次。" checked={settings.floatingText} onChange={floatingText=>set(api,{floatingText})}/>
  {settings.floatingText&&<>
   <Choices label="飘字方向" items={[["horizontal","横向"],["vertical","竖向"]]} value={settings.textDirection} onChange={textDirection=>set(api,{textDirection})}/>
   <label className="muyu-color-row"><span>文字颜色</span><input aria-label="飘字颜色" type="color" value={settings.textColor} onChange={e=>set(api,{textColor:e.target.value})}/></label>
   <label className="range-row"><span>文字大小 <b>{settings.textSize}</b></span><input aria-label="飘字大小" type="range" min="20" max="56" step="2" value={settings.textSize} onChange={e=>set(api,{textSize:Number(e.target.value)})}/></label>
   <div className="muyu-text-preview" aria-label="愿想显示预览"><span style={{color:settings.textColor,fontSize:`${settings.textSize}px`,writingMode:settings.textDirection==='vertical'?'vertical-rl':'horizontal-tb'}}>{preview}</span></div>
  </>}
  <Toggle label="低动效" description="减小木槌与环境动态，飘字轻轻淡出。" checked={settings.reducedMotion} onChange={reducedMotion=>set(api,{reducedMotion})}/>
 </>
}

function SoundControls({view,api}){const settings=view.settings;return <>
 <p className="muyu-eyebrow">敲击音色</p>
 <Choices label="木鱼音色" items={TONES.map(t=>[t.id,t.name])} value={settings.tone} onChange={tone=>set(api,{tone})}/>
 <button className="text-button muyu-preview-sound" disabled={!settings.sound} onClick={()=>api()?.previewSound(settings.tone)}><Volume2 size={16}/>试听当前音色</button>
 <Toggle label="敲击与场景音效" description="只有互动和静念结束时发声，不播放背景音乐。" checked={settings.sound} onChange={sound=>set(api,{sound})}/>
 <label className="range-row"><span>本主题音量 <b>{Math.round(settings.volume*100)}%</b></span><input aria-label="电子木鱼音量" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={e=>set(api,{volume:Number(e.target.value)})}/></label>
 <p className="inline-note">音色与材质独立选择，音量同时受程序总音量控制。</p>
 {view.audioStatus==='error'&&<p className="inline-note" role="status">音效暂不可用，敲击仍正常计数。重新进入主题后可重试。</p>}
 </>}

function Skins({view,api}){return <><div className="muyu-skins">{SKINS.map(skin=><button key={skin.id} type="button" aria-pressed={view.settings.skin===skin.id} onClick={()=>set(api,{skin:skin.id})}><img className="muyu-material" src={`${import.meta.env.BASE_URL}assets/muyu/${skin.id}.webp`} alt=""/><strong>{skin.name}</strong><small>{materialNotes[skin.id]}</small>{view.settings.skin===skin.id&&<Check className="muyu-skin-check" size={15}/>}</button>)}</div><p className="inline-note">换材质保留敲击位置、音色、愿想和静念进度。</p><div className="section-divider"/><SoundControls view={view} api={api}/></>}

function Focus({view,api}){
 const focus=view.focus,[minutes,setMinutes]=useState(()=>FOCUS_MINUTES.includes(focus.durationMs/60000)?focus.durationMs/60000:25),[mode,setMode]=useState(focus.mode||'manual');
 const active=focus.status==='running'||focus.status==='paused';
 const labels={idle:'为自己留一段静念的时间',running:'这一刻，安心静念',paused:'已暂停，等你准备好',complete:'这段静念，圆满结束',ended:'已经结束，歇一会儿'};
 return <>
  <div className="muyu-focus-clock"><span>{labels[focus.status]}</span><strong>{formatTime(active||focus.status==='complete'?focus.remainingMs:minutes*60000)}</strong><small>{active?({manual:'手动敲击',auto:'自动敲击',ambient:'仅环境陪伴'})[focus.mode]:'不补算离线时间，也没有连续打卡要求'}</small></div>
  {!active&&<><p className="muyu-eyebrow">静念时长</p><Choices label="静念时长" items={FOCUS_MINUTES.map(n=>[n,`${n} 分钟`])} value={minutes} onChange={setMinutes}/><p className="muyu-eyebrow">陪伴方式</p><Choices label="静念方式" items={[["manual","手动敲击"],["auto","自动敲击"],["ambient","仅环境陪伴"]]} value={mode} onChange={setMode}/></>}
  <div className="muyu-buttons">{!active?<button className="primary-button" onClick={()=>api()?.command('focusStart',{minutes,mode})}><Flame size={16}/>开始静念</button>:<><button className="primary-button" onClick={()=>api()?.command(focus.status==='running'?'focusPause':'focusResume')}>{focus.status==='running'?<Pause size={16}/>:<Play size={16}/>} {focus.status==='running'?'暂停静念':'继续静念'}</button><button className="text-button" onClick={()=>api()?.command('focusEnd')}><Square size={15}/>提前结束</button></>}</div>
  <p className="inline-note">切换主题、窗口休眠或重启会暂停。回来后由你决定是否继续；到时停止自动，只轻轻提示一次。</p>
 </>
}

export function MuyuEnvironment({view,api}){if(!view)return null;const settings=view.settings;return <div className="muyu-environment">
 <p className="muyu-eyebrow">窗外四季</p>
 <Choices label="电子木鱼季节" className="muyu-wrap" items={[["auto","跟随应用"],["spring","春"],["summer","夏"],["autumn","秋"],["winter","冬"]]} value={settings.season} onChange={season=>set(api,{season})}/>
 <p className="muyu-eyebrow">禅房光阴</p>
 <Choices label="电子木鱼时间" className="muyu-wrap" items={[["auto","跟随时间",RefreshCw],["dawn","清晨",Sunrise],["day","白天",Sun],["dusk","黄昏",Sunset],["night","夜晚",Moon]]} value={settings.time} onChange={time=>set(api,{time})}/>
 <p className="muyu-eyebrow">灯火</p>
 <Choices label="灯火状态" items={[["auto","随日夜"],["on","全部点亮"],["off","全部熄灭"]]} value={settings.lights} onChange={lights=>set(api,{lights})}/>
 <Toggle label="一缕香烟" description="轻点香炉也可以开关，香烟随风缓缓消散。" checked={settings.smoke} onChange={smoke=>set(api,{smoke})}/>
 <Toggle label="低动效" description="保留轻微呼吸感，减少环境和敲击运动。" checked={settings.reducedMotion} onChange={reducedMotion=>set(api,{reducedMotion})}/>
 <p className="inline-note">这里的手动预览只影响电子木鱼，不会改变其他主题。</p>
 <div className="section-divider"/><SoundControls view={view} api={api}/>
 </div>}

export function MuyuPanels({panel,view,api,onClose}){
 if(!view||!panel?.startsWith('muyu-'))return null;
 const name=panel.slice(5),titles={auto:['听木鱼，慢一点','一声一念，留一点清静。'],text:['愿想，寄一份小小心意','用喜欢的话，陪自己片刻。'],skins:['木玉瓷陶，各有温度','材质和音色，随心搭配。'],focus:['静念，安心做一件事','时间留在当下，回来再继续。'],environment:['窗外有四时，室内有微光','只调整这间禅房的季节与光阴。']};
 if(!titles[name])return null;
 const [title,subtitle]=titles[name];return <Panel title={title} subtitle={subtitle} onClose={onClose} wide={name==='skins'}><div className="muyu-panel">
 {name==='auto'&&<Automatic view={view} api={api}/>}{name==='text'&&<TextControls view={view} api={api}/>}{name==='skins'&&<Skins view={view} api={api}/>}{name==='focus'&&<Focus view={view} api={api}/>}{name==='environment'&&<MuyuEnvironment view={view} api={api}/>}
 </div></Panel>
}
