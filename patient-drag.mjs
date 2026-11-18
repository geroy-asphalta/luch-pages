// Spreadsheet-like row drag for the shared patient order.
// A quick click keeps the existing open/select action; only movement reorders people.
export function setupPatientReordering({container,onMove,getEnabled,notice}){
 let pending=null,active=null,drop=null,ghost=null,frame=0,suppressClick=false;
 const rows=()=>[...container.querySelectorAll('tr[data-person-id]')];
 const group=id=>rows().filter(row=>row.dataset.personId===id);
 const visibleIds=()=>[...new Set(rows().map(row=>row.dataset.personId))];
 const scrollBox=()=>container.closest('.patient-register-scroll,.scroll')||container;
 const clearDrop=()=>{
  if(drop?.marker)drop.marker.classList.remove('patient-drop-before','patient-drop-after');
  drop=null;
 };
 const clean=()=>{
  if(pending?.timer)clearTimeout(pending.timer);
  pending=null;
  if(frame)cancelAnimationFrame(frame);
  frame=0;
  clearDrop();
  if(active){
   for(const row of group(active.source))row.classList.remove('patient-dragging');
   document.body.classList.remove('patient-row-is-moving');
  }
  active=null;
  ghost?.remove();ghost=null;
 };
 function showGhost(x,y){
  if(!ghost)return;
  ghost.style.left=Math.min(x+16,window.innerWidth-ghost.offsetWidth-12)+'px';
  ghost.style.top=Math.min(y+12,window.innerHeight-ghost.offsetHeight-12)+'px';
 }
 function refreshDrop(x,y){
  if(!active)return;
  const box=scrollBox(),rect=box.getBoundingClientRect();
  if(x<rect.left-20||x>rect.right+20||y<rect.top-25||y>rect.bottom+25){
   clearDrop();return;
  }
  let hit=document.elementFromPoint(x,y)?.closest('tr[data-person-id]');
  if(!hit||!container.contains(hit)){
   // Permit dropping in the empty space just above/below a visible row.
   hit=rows().filter(row=>row.dataset.personId!==active.source)
    .sort((a,b)=>Math.abs((a.getBoundingClientRect().top+a.getBoundingClientRect().bottom)/2-y)-
                 Math.abs((b.getBoundingClientRect().top+b.getBoundingClientRect().bottom)/2-y))[0];
  }
  if(!hit||hit.dataset.personId===active.source){clearDrop();return;}
  const relatives=group(hit.dataset.personId);
  if(!relatives.length){clearDrop();return;}
  const upper=relatives[0].getBoundingClientRect().top;
  const lower=relatives.at(-1).getBoundingClientRect().bottom;
  const before=y<(upper+lower)/2;
  const marker=before?relatives[0]:relatives.at(-1);
  const placement=before?'before':'after';
  if(drop?.id===hit.dataset.personId&&drop.placement===placement&&drop.marker===marker)return;
  clearDrop();
  marker.classList.add(before?'patient-drop-before':'patient-drop-after');
  drop={id:hit.dataset.personId,placement,marker};
 }
 function scrollFrame(){
  if(!active)return;
  const box=scrollBox(),rect=box.getBoundingClientRect(),y=active.y;
  const edge=42,fast=17;
  if(box.scrollHeight>box.clientHeight+2&&y>=rect.top-20&&y<=rect.bottom+20){
   const amount=y<rect.top+edge?-fast:y>rect.bottom-edge?fast:0;
   if(amount)box.scrollTop+=amount;
  }else{
   const amount=y<edge?-fast:y>window.innerHeight-edge?fast:0;
   if(amount)window.scrollBy(0,amount);
  }
  refreshDrop(active.x,active.y);
  frame=requestAnimationFrame(scrollFrame);
 }
 function activate(){
  if(!pending)return;
  if(!getEnabled()){
   notice('Для перемещения выбери сортировку «Общий порядок».');
   clean();return;
  }
  active=pending;pending=null;
  for(const row of group(active.source))row.classList.add('patient-dragging');
  document.body.classList.add('patient-row-is-moving');
  ghost=document.createElement('div');
  ghost.className='patient-drag-ghost';
  ghost.textContent=active.name+(group(active.source).length>1?' · '+group(active.source).length+' курса':'');
  ghost.setAttribute('aria-hidden','true');
  document.body.appendChild(ghost);
  showGhost(active.x,active.y);
  refreshDrop(active.x,active.y);
  frame=requestAnimationFrame(scrollFrame);
 }
 function moveOne(id,direction){
  if(!getEnabled()){notice('Для перемещения выбери сортировку «Общий порядок».');return;}
  const ids=visibleIds(),index=ids.indexOf(id),target=ids[index+direction];
  if(index<0||!target)return;
  onMove(id,target,direction<0?'before':'after');
 }
 container.addEventListener('pointerdown',event=>{
  if(event.button!==0||pending||active)return;
  const row=event.target.closest('tr[data-person-id]');
  if(!row||!container.contains(row))return;
  // Only the patient's name column starts a reorder, never the schedule, ID or machine.
  if(!event.target.closest('td.name,td.reg-name'))return;
  // Editing buttons, form controls and links retain their own mouse handling.
  const control=event.target.closest('button,a,input,select,textarea,[contenteditable="true"]');
  if(control&&!control.matches('.patient-open,.reg-person-open'))return;
  const touch=event.pointerType==='touch';
  // On touch a long press inside the name cell is required; a swipe scrolls normally.
  const name=row.querySelector('.patient-open,.reg-person-open')?.textContent?.trim()||row.dataset.personId;
  pending={source:row.dataset.personId,name,pointerId:event.pointerId,
   pointerType:event.pointerType,x:event.clientX,y:event.clientY,
   startX:event.clientX,startY:event.clientY,timer:null};
  if(touch){
   const token=pending;
   token.timer=setTimeout(()=>{if(pending===token)activate();},320);
  }
 });
 document.addEventListener('pointermove',event=>{
  const current=active||pending;
  if(!current||event.pointerId!==current.pointerId)return;
  if(pending){
   const distance=Math.hypot(event.clientX-current.startX,event.clientY-current.startY);
   if(current.pointerType==='touch'){
    if(distance>9)clean(); // A swipe is not an intentional row move.
    return;
   }
   if(distance<7)return;
   current.x=event.clientX;current.y=event.clientY;
   activate();
  }
  if(!active)return;
  active.x=event.clientX;active.y=event.clientY;
  showGhost(active.x,active.y);
  refreshDrop(active.x,active.y);
  if(event.cancelable)event.preventDefault();
 },{capture:true,passive:false});
 document.addEventListener('pointerup',event=>{
  const current=active||pending;
  if(!current||event.pointerId!==current.pointerId)return;
  if(!active){clean();return;}
  refreshDrop(event.clientX,event.clientY);
  const source=active.source,target=drop?.id,placement=drop?.placement;
  suppressClick=true;
  clean();
  // Synthetic click follows pointerup; suppress only that click, not the next real click.
  setTimeout(()=>{suppressClick=false;},0);
  if(target&&target!==source)onMove(source,target,placement);
 },true);
 document.addEventListener('pointercancel',event=>{
  if((active||pending)?.pointerId===event.pointerId)clean();
 },true);
 document.addEventListener('click',event=>{
  if(!suppressClick)return;
  suppressClick=false;
  event.preventDefault();event.stopImmediatePropagation();
 },true);
 container.addEventListener('keydown',event=>{
  if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
  const row=event.target.closest('tr[data-person-id]');
  if(!row||!container.contains(row))return;
  event.preventDefault();event.stopPropagation();
  moveOne(row.dataset.personId,event.key==='ArrowUp'?-1:1);
 });
 container.addEventListener('dragstart',event=>event.preventDefault());
}
