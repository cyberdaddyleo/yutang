/** One scene transform for rendering, pointer hits and animation anchors. */
export const SCENE={width:1600,height:900};
export const WOOD={x:575,y:255,w:480,h:354,anchorX:815,anchorY:609};
// The padded face meets the upper shoulder, above the carved mouth.
export const IMPACT={x:986,y:350};
export const PAD={x:548,y:488,w:545,h:171};
export const INCENSE={x:409,y:425};
export const BEADS={x:360,y:615};
export const BEAD_SPRITE={x:270,y:578,w:180,h:175.25};
export const CANDLE={x:1126,y:584,w:58,h:40.91,wickX:1155.52,wickY:589.11};
// Reference composition: left lamp behind foliage, upper lamp cropped by the
// ceiling, and the right lantern on its full pedestal on the rear platform.
// Heights preserve the trimmed sprite aspect ratios; x/y describe sprite centre.
export const LAMPS=[
 {x:132,y:116,w:140,h:140*1024/473,asset:'lantern-hanging-v3',lightY:.5},
 {x:1037,y:32,w:128,h:128*1024/473,asset:'lantern-hanging-v3',lightY:.5},
 {x:1388,y:358.8,w:284*361/1024,h:284,asset:'lantern-standing-v3',standing:true,lightY:.34737},
];
export function sceneTransform(width,height){const scale=Math.max(width/SCENE.width,height/SCENE.height);return {scale,x:(width-SCENE.width*scale)/2,y:(height-SCENE.height*scale)/2,width:SCENE.width*scale,height:SCENE.height*scale};}
export function scenePoint(x,y,transform){return {x:(x-transform.x)/transform.scale/SCENE.width,y:(y-transform.y)/transform.scale/SCENE.height};}
export function hitMuyu(p){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;const x=p.x*1600,y=p.y*900;
 // The same visible outline is shared by all eight materials. No hit area changes on skin selection.
 if(((x-815)/234)**2+((y-449)/158)**2<=1.08&&y<=612)return 'wood';
 if(((x-INCENSE.x)/70)**2+((y-440)/78)**2<=1)return 'incense';
 if(((x-BEADS.x)/96)**2+((y-BEADS.y)/43)**2<=1)return 'beads';
 if(LAMPS.some(l=>Math.abs(x-l.x)<l.w*.52&&Math.abs(y-l.y)<l.h*.5))return 'lamp';
 if(Math.abs(x-1155)<34&&Math.abs(y-615)<52)return 'lamp';return null;}
