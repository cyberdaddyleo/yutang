// One shared neutral fur-detail texture per Three module/context pool. Every
// instance retains it, so changing coats cannot interrupt another cat's fur.
const pools=new WeakMap();
export function acquireCatFurDetail(THREE,{enabled=typeof document!=='undefined',url=`${import.meta.env?.BASE_URL||'/'}assets/cats/3d/fur-ivory-detail.webp`}={}){
 let entry=pools.get(THREE);
 if(!entry){
  const placeholder=new THREE.DataTexture(new Uint8Array([209,209,209,255]),1,1);placeholder.needsUpdate=true;
  entry={refs:0,dead:false,placeholder,texture:placeholder,ready:{value:0},sampler:{value:placeholder}};pools.set(THREE,entry);
  if(enabled){
   const loaded=new THREE.TextureLoader().load(url,texture=>{
    if(entry.dead){if(!entry.pendingDisposed)texture.dispose();return}
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=4;texture.needsUpdate=true;
    entry.texture=texture;entry.sampler.value=texture;entry.ready.value=1;
   },undefined,()=>{entry.ready.value=0});
   entry.pending=loaded;
  }
 }
 entry.refs++;let disposed=false;
 return {sampler:entry.sampler,ready:entry.ready,dispose(){
  if(disposed)return;disposed=true;if(--entry.refs)return;
  entry.dead=true;entry.ready.value=0;pools.delete(THREE);entry.placeholder.dispose();
  if(entry.texture!==entry.placeholder)entry.texture.dispose();
  else if(entry.pending){entry.pending.dispose();entry.pendingDisposed=true;}
 }};
}
