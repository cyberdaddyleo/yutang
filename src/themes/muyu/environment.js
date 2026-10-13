export const MUYU_SEASONS = Object.freeze(['spring','summer','autumn','winter']);
export const MUYU_TIMES = Object.freeze(['dawn','day','dusk','night']);

/** Resolve without mutating the application's clock or another theme's choices. */
export function resolveMuyuEnvironment(settings={},app={},date=new Date()) {
  let current = app.now instanceof Date ? app.now : Number.isFinite(app.now) ? new Date(app.now) : date;
  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) current = new Date();
  const month=current.getMonth()+1,hour=current.getHours()+current.getMinutes()/60;
  const localSeason=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
  const season=MUYU_SEASONS.includes(settings.season)?settings.season:MUYU_SEASONS.includes(app.season)?app.season:localSeason;
  let time=hour>=5&&hour<8?'dawn':hour>=8&&hour<17?'day':hour>=17&&hour<19?'dusk':'night';
  if(MUYU_TIMES.includes(settings.time))time=settings.time;
  else if(typeof app.night==='boolean') {
    if(app.night)time='night';
    else if(time==='night')time='day';
  }
  const night=time==='night';
  const lights=settings.lights==='on'||settings.lights==='all-on'?true:settings.lights==='off'||settings.lights==='all-off'?false:time==='night'||time==='dusk';
  return {season,time,night,lights};
}
