import {ASPECT} from './geometry.js';

export const PROP_NAMES=Object.freeze({food:'食盆',yarn:'毛线球',scratch:'猫抓板',wand:'逗猫棒',mouse:'玩具小鼠'});
// Bounds of the painted artwork in CatRenderer.drawPropArtwork, measured at
// the same 1600 px reference width. Ignore the 384 px sprite's transparent rim.
const BOUNDS={food:[-17,-10,34,20],yarn:[-12,-12,50,27],scratch:[-27,-15,54,31],mouse:[-32,-10,46,21],wand:[-23,-57,42,73]};
export function placedProps(props=[]){return props.filter(prop=>Object.hasOwn(PROP_NAMES,prop.tool));}
export function propHitBounds(prop,drawWidth=1600){
 const b=BOUNDS[prop?.tool];if(!b)return null;
 const scale=prop.tool==='food'?(prop.foodScale||1):1;
 const padding=Math.max(5,7*1600/Math.max(1,drawWidth));
 return {left:prop.x+(b[0]*scale-padding)/1600,top:prop.y+(b[1]*scale-padding)/1600/ASPECT,right:prop.x+((b[0]+b[2])*scale+padding)/1600,bottom:prop.y+((b[1]+b[3])*scale+padding)/1600/ASPECT};
}
export function hitPlacedProp(props,point,drawWidth=1600){
 if(!point)return null;
 // Match front-to-back rendering when two placed objects overlap.
 return [...placedProps(props)].sort((a,b)=>b.y-a.y).find(prop=>{const b=propHitBounds(prop,drawWidth);return point.x>=b.left&&point.x<=b.right&&point.y>=b.top&&point.y<=b.bottom})||null;
}

// Native desktop mode deliberately has no focusable HUD: macOS forwards a
// scene click while the window stays mouse-transparent. Preserve one-click
// play there, and leave collecting/rearranging to the existing control window.
export function interactWithPlacedProp(prop,{desktopMode=false,onOpen,onUse}){
 if(!prop)return false;
 if(desktopMode){if(!prop.persistent)return false;onUse(prop.id);return true;}
 onOpen(prop);return true;
}
