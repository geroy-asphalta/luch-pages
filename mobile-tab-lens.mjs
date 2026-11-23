// Presentation-only iOS tab lens. The shared mobile navigator remains the
// sole owner of actual tab changes; dragging previews without rendering pages.
export function nearestMobileTabIndex(x,centers){
 if(!centers.length)return -1;
 let nearest=0,smallest=Infinity;
 for(let i=0;i<centers.length;i++){
  const distance=Math.abs(x-centers[i]);
  if(distance<smallest){smallest=distance;nearest=i;}
 }
 return nearest;
}

export function createMobileTabLens(tabbar,onChoose){
 const buttons=[...tabbar.querySelectorAll('button[data-mobile-tab]')];
 if(buttons.length<2)return {sync(){}};
 const lens=document.createElement('span');
 lens.className='mobile-tab-lens';
 lens.setAttribute('aria-hidden','true');
 tabbar.prepend(lens);
 tabbar.classList.add('has-mobile-lens');
 let geometry=[],barLeft=0,gesture=null,ignoreClickUntil=0;

 function measure(){
  const bar=tabbar.getBoundingClientRect();
  if(!bar.width)return false; // Hidden desktop navigation.
  barLeft=bar.left;
  geometry=buttons.map(button=>{
   const rect=button.getBoundingClientRect();
   return {left:rect.left-bar.left,top:rect.top-bar.top,width:rect.width,
    height:rect.height,center:rect.left+rect.width/2};
  });
  return geometry.every(box=>box.width>0);
 }
 function moveTo(left,width,top,height,stretch=1){
  lens.style.width=width+'px';
  lens.style.height=height+'px';
  lens.style.top=top+'px';
  lens.style.transform='translate3d('+left+'px,0,0) scaleX('+stretch+')';
  lens.classList.add('is-ready');
 }
 function activeIndex(){
  const index=buttons.findIndex(button=>button.classList.contains('is-current'));
  return index<0?0:index;
 }
 function clearPreview(){
  for(const button of buttons)button.classList.remove('is-preview');
 }
 function sync(){
  if(gesture?.dragging||!measure())return;
  const box=geometry[activeIndex()];
  clearPreview();
  moveTo(box.left,box.width,box.top,box.height);
 }
 function track(clientX,deltaX){
  const first=geometry[0],last=geometry[geometry.length-1];
  const center=Math.max(first.center,Math.min(last.center,clientX));
  const index=nearestMobileTabIndex(center,geometry.map(box=>box.center));
  const box=geometry[index];
  // The lens follows the finger continuously; color previews the closest tab.
  const left=center-barLeft-box.width/2;
  const stretch=Math.min(1.13,1+Math.abs(deltaX)*.012);
  moveTo(left,box.width,box.top,box.height,stretch);
  buttons.forEach((button,i)=>button.classList.toggle('is-preview',i===index));
  return index;
 }
 function end(event,cancelled=false){
  if(!gesture||gesture.id!==event.pointerId)return;
  const wasDragging=gesture.dragging;
  const destination=wasDragging?nearestMobileTabIndex(event.clientX,geometry.map(box=>box.center)):-1;
  gesture=null;
  if(tabbar.hasPointerCapture?.(event.pointerId)){
   try{tabbar.releasePointerCapture(event.pointerId);}catch{}
  }
  tabbar.classList.remove('is-dragging');
  lens.classList.remove('is-tracking');
  clearPreview();
  if(wasDragging&&!cancelled&&destination>=0){
   // A synthetic click after pointerup must not reopen the pressed tab.
   ignoreClickUntil=performance.now()+250;
   onChoose(buttons[destination].dataset.mobileTab);
  }
  sync();
 }
 tabbar.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
  const button=event.target.closest?.('button[data-mobile-tab]');
  if(!button||!tabbar.contains(button)||!measure())return;
  ignoreClickUntil=0; // New deliberate tap is never suppressed.
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,dragging:false};
 });
 tabbar.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  if(!gesture.dragging){
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.15)return;
   gesture.dragging=true;
   tabbar.classList.add('is-dragging');
   lens.classList.add('is-tracking');
   // Capture only after horizontal drag is recognized. Ordinary taps keep
   // native button click, keyboard access, and VoiceOver activation.
   try{tabbar.setPointerCapture?.(event.pointerId);}catch{}
  }
  event.preventDefault();
  track(event.clientX,event.clientX-gesture.lastX);
  gesture.lastX=event.clientX;
 },{passive:false});
 tabbar.addEventListener('pointerup',event=>end(event));
 tabbar.addEventListener('pointercancel',event=>end(event,true));
 tabbar.addEventListener('lostpointercapture',event=>{
  if(gesture&&event.pointerId===gesture.id)end(event,true);
 });
 tabbar.addEventListener('click',event=>{
  if(performance.now()<ignoreClickUntil){
   ignoreClickUntil=0;
   event.preventDefault();
   event.stopImmediatePropagation();
  }
 },true);
 window.addEventListener('resize',sync,{passive:true});
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(sync).observe(tabbar);
 sync();
 return {sync};
}
