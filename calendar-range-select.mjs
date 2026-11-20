import {frozenHeaderWidth} from './calendar-frozen-columns.mjs';
// Spreadsheet-style rectangular selection. Only mouse/stylus drags select a range;
// touch taps continue to use the existing multi-select behavior.
const key=(id,date)=>id+'|'+date;
const idOf=item=>typeof item==='string'?item:item.id;

export function calendarSelectionRectangle(patients,dates,from,to,base=[]){
 const rows=patients.map(idOf),a=rows.indexOf(from.patientId),b=rows.indexOf(to.patientId);
 const first=dates.indexOf(from.date),last=dates.indexOf(to.date);
 const result=new Set(base);
 if(Math.min(a,b,first,last)<0)return result;
 for(let i=Math.min(a,b);i<=Math.max(a,b);i++){
  for(let j=Math.min(first,last);j<=Math.max(first,last);j++)result.add(key(rows[i],dates[j]));
 }
 return result;
}

// A repeated tap/click removes the already-selected cell instead of selecting
// it again. Plain clicks on a NEW cell still replace the old selection;
// Ctrl/Cmd and touch preserve multi-selection behavior.
export function calendarClickSelection(current,key,{additive=false}={}){
 const next=new Set(additive||current.has(key)?current:[]);
 if(next.has(key))next.delete(key);
 else next.add(key);
 return next;
}

export function setupCalendarRangeSelection({calendar,getPatients,getDates,getSelected,onPreview,onCommit}){
 let pending=null,active=null,preview=null,cellIndex=null,frame=0,suppressClickUntil=0;
 const scroll=()=>calendar.closest('.scroll')||calendar.parentElement;
 const cellAt=event=>event.target?.closest?.('td.day[data-id][data-date]');
 const point=td=>({patientId:td.dataset.id,date:td.dataset.date});
 function restorePreview(){
  if(!active)return;
  const before=new Set(getSelected());
  for(const k of preview||[])if(!before.has(k))cellIndex?.get(k)?.classList.remove('selected');
  for(const k of before)if(!preview?.has(k))cellIndex?.get(k)?.classList.add('selected');
  onPreview(before);
 }
 function cleanup(){
  if(frame)cancelAnimationFrame(frame);
  frame=0;
  pending=null;active=null;preview=null;cellIndex=null;
  document.body.classList.remove('calendar-range-moving');
 }
 function cellNear(x,y){
  const exact=document.elementFromPoint(x,y)?.closest('td.day[data-id][data-date]');
  if(exact&&calendar.contains(exact))return exact;
  const rows=[...calendar.querySelectorAll('tbody tr[data-person-id]')];
  const headings=[...calendar.querySelectorAll('thead th[data-date]')];
  if(!rows.length||!headings.length)return null;
  const scroller=scroll(),r=scroller.getBoundingClientRect();
  const frozen=frozenHeaderWidth(calendar);
  const xSafe=Math.max(r.left+frozen+1,Math.min(x,r.right-1));
  const nearRow=rows.reduce((best,row)=>{
   const box=row.getBoundingClientRect(),center=(box.top+box.bottom)/2;
   return !best||Math.abs(y-center)<best.distance?{row,distance:Math.abs(y-center)}:best;
  },null)?.row;
  const nearDate=headings.reduce((best,th)=>{
   const box=th.getBoundingClientRect(),center=(box.left+box.right)/2;
   return !best||Math.abs(xSafe-center)<best.distance?
    {date:th.dataset.date,distance:Math.abs(xSafe-center)}:best;
  },null)?.date;
  if(!nearRow||!nearDate)return null;
  return [...nearRow.querySelectorAll('td.day[data-date]')].find(td=>td.dataset.date===nearDate)||null;
 }
 function showSelection(end){
  if(!active)return;
  if(end)active.end=end;
  const keys=calendarSelectionRectangle(active.rows,active.dates,active.start,active.end,active.base);
  if(preview&&keys.size===preview.size&&[...keys].every(k=>preview.has(k)))return;
  if(!cellIndex){
   cellIndex=new Map([...calendar.querySelectorAll('td.day[data-id][data-date]')]
    .map(td=>[key(td.dataset.id,td.dataset.date),td]));
  }
  const old=preview||getSelected();
  for(const k of old)if(!keys.has(k))cellIndex.get(k)?.classList.remove('selected');
  for(const k of keys)if(!old.has(k))cellIndex.get(k)?.classList.add('selected');
  preview=keys;
  onPreview(keys);
 }
 function autoScroll(){
  if(!active)return;
  const scroller=scroll(),rect=scroller.getBoundingClientRect();
  const frozen=frozenHeaderWidth(calendar);
  const edge=36,x=active.x,y=active.y;
  if(y>=rect.top&&y<=rect.bottom){
   const min=rect.left+frozen;
   if(x<=min+edge&&x>=rect.left)scroller.scrollLeft-=18;
   else if(x>=rect.right-edge&&x<=rect.right+20)scroller.scrollLeft+=18;
  }
  if(scroller.scrollHeight>scroller.clientHeight+2){
   if(y>=rect.bottom-edge&&y<=rect.bottom+20)scroller.scrollTop+=14;
   else if(y<=rect.top+edge&&y>=rect.top-20)scroller.scrollTop-=14;
  }
  const end=cellNear(x,y);
  if(end)showSelection(point(end));
  frame=requestAnimationFrame(autoScroll);
 }
 calendar.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||pending||active)return;
  const td=cellAt(event);
  if(!td||!calendar.contains(td))return;
  pending={pointerId:event.pointerId,start:point(td),x:event.clientX,y:event.clientY,
   additive:Boolean(event.ctrlKey||event.metaKey)};
 });
 document.addEventListener('pointermove',event=>{
  const state=active||pending;
  if(!state||event.pointerId!==state.pointerId)return;
  if(pending){
   if(Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<6)return;
   const initial=pending;
   pending=null;
   active={...initial,rows:getPatients().map(idOf),dates:getDates(),
    base:initial.additive?new Set(getSelected()):new Set(),
    end:initial.start,x:event.clientX,y:event.clientY};
   document.body.classList.add('calendar-range-moving');
   showSelection(initial.start);
   frame=requestAnimationFrame(autoScroll);
  }
  active.x=event.clientX;active.y=event.clientY;
  const td=cellNear(active.x,active.y);
  if(td)showSelection(point(td));
  if(event.cancelable)event.preventDefault();
 },{capture:true,passive:false});
 document.addEventListener('pointerup',event=>{
  const state=active||pending;
  if(!state||state.pointerId!==event.pointerId)return;
  if(!active){cleanup();return;} // Click / Shift+click / Cmd+click still work normally.
  const td=cellNear(event.clientX,event.clientY);
  if(td)showSelection(point(td));
  const done=preview||calendarSelectionRectangle(active.rows,active.dates,active.start,active.end,active.base);
  const from=active.start;
  cleanup();
  suppressClickUntil=Date.now()+500;
  onCommit(done,from);
  if(event.cancelable)event.preventDefault();
 },true);
 document.addEventListener('pointercancel',event=>{
  if((active||pending)?.pointerId!==event.pointerId)return;
  restorePreview();cleanup();
 },true);
 document.addEventListener('click',event=>{
  if(Date.now()>suppressClickUntil)return;
  suppressClickUntil=0;
  event.preventDefault();
  event.stopImmediatePropagation();
 },true);
 calendar.addEventListener('dragstart',event=>{
  if(event.target?.closest?.('td.day'))event.preventDefault();
 });
}
