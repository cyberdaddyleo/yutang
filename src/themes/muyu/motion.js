/** One clock owns the approach, contact and return; sound never starts an animation. */
export const MUYU_CONTACT_MS=100;
export const MUYU_STROKE_MS=340;
export const MUYU_CONTACT_HOLD_MS=40;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)};
const mix=(a,b,t)=>a+(b-a)*t;
const rest=()=>({amount:0,rotation:0,lift:0});
const blend=(a,b,t)=>({amount:mix(a.amount,b.amount,t),rotation:mix(a.rotation,b.rotation,t),lift:mix(a.lift,b.lift,t)});

/** amount follows the calibrated rest-head -> contact-head path. At contact all
 * supplementary rotation/lift are zero, so every material uses the same target. */
export function sampleMuyuStroke(stroke,now){
 if(!stroke||!Number.isFinite(now)||now<stroke.at||now>=stroke.endAt)return {...rest(),active:false,contactAt:stroke?.impactAt??null,phase:'rest'};
 const from=stroke.from||rest(),quiet=stroke.reducedMotion,contact={amount:1,rotation:0,lift:0};
 const preparationMs=quiet?0:14,prepared={amount:from.amount-(1-from.amount)*.01,rotation:from.rotation+.004,lift:from.lift-.65};
 const age=now-stroke.at;let pose,phase;
 if(preparationMs&&age<preparationMs){pose=blend(from,prepared,smooth(age/preparationMs));phase='prepare'}
 else if(now<stroke.impactAt){const t=clamp((age-preparationMs)/(stroke.impactAt-stroke.at-preparationMs));pose=blend(quiet?from:prepared,contact,t*t);phase='fall'}
 else if(now<stroke.impactAt+MUYU_CONTACT_HOLD_MS){pose=contact;phase='contact'}
 else if(now<stroke.impactAt+MUYU_CONTACT_HOLD_MS+100){const t=clamp((now-stroke.impactAt-MUYU_CONTACT_HOLD_MS)/100);pose=blend(contact,{amount:.055,rotation:quiet?0:.003,lift:quiet?0:-.5},1-(1-t)**2);phase='rebound'}
 else{pose=blend({amount:.055,rotation:quiet?0:.003,lift:quiet?0:-.5},rest(),smooth((now-stroke.impactAt-MUYU_CONTACT_HOLD_MS-100)/(stroke.endAt-stroke.impactAt-MUYU_CONTACT_HOLD_MS-100)));phase='return'}
 return {...pose,active:true,contactAt:stroke.impactAt,phase};
}

/** Dense inputs before one contact share the physical stroke, retaining their
 * separate model hit IDs. A later stroke begins at the current pose, not rest. */
export function createMuyuStroke(previous,event,{reducedMotion=false}={}){
 const id=event.strokeId??event.id;if(previous?.id===id)return previous;
 const at=event.at,impactAt=Number.isFinite(event.impactAt)?event.impactAt:at+MUYU_CONTACT_MS;
 const current=sampleMuyuStroke(previous,at);
 return {id,source:event.source,at,impactAt,endAt:at+MUYU_STROKE_MS,reducedMotion:!!reducedMotion,from:{amount:current.amount,rotation:current.rotation,lift:current.lift}};
}

/** Pointer-only press latch, kept pure so long holds and releases are testable.
 * Wood starts on press. Other ornaments retain their release-to-activate rule. */
export function createMuyuPressGesture({usable,hitAt,focusWood=()=>{},activate}){
 let down=null;
 return {
  down(event){
   if(event.button!==0||down||!usable(event.clientX,event.clientY))return false;
   const hit=hitAt(event.clientX,event.clientY);down={id:event.pointerId,x:event.clientX,y:event.clientY,hit};
   if(hit==='wood'){focusWood();activate(hit)}return true;
  },
  up(event){
   const start=down;if(!start||event.pointerId!==start.id)return false;down=null;
   if(start.hit==='wood'||event.button!==0||!usable(event.clientX,event.clientY)||Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)return false;
   const hit=hitAt(event.clientX,event.clientY);if(hit&&hit===start.hit){activate(hit);return true}return false;
  },
  cancel(){down=null},
 };
}
