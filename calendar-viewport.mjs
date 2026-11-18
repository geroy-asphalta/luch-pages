import {datesForMonth,addDays} from './planner.mjs';
import {frozenHeaderWidth} from './calendar-frozen-columns.mjs';

// Rendering only: keep the familiar 42-day grid and append four more weeks.
// November 2026 then spans 26 October through 3 January, including all December.
// The planner, its month window and treatment rules remain unchanged.
export function calendarWindowDates(month){
 const base=datesForMonth(month);
 const last=base.at(-1);
 return [...base,...Array.from({length:28},(_,i)=>addDays(last,i+1))];
}

// Keep historical dates horizontally accessible while showing the requested week
// directly after the sticky patient columns, even on very wide monitors.
// A blank table column (NOT a new date/session) allows enough rightward scrolling.
export function scrollCalendarToWeek(calendar,weekStart){
 if(!calendar||!weekStart)return false;
 const scroller=calendar.closest('.scroll')||calendar.parentElement;
 if(!scroller)return false;
 // Recalculate any previously added blank padding, for example after a resize.
 // Keeping an old wide-screen spacer makes scrolling end in a huge empty area.
 const tail=calendar.querySelector('thead th.calendar-tail');
 if(tail)calendar.style.removeProperty('--calendar-trailing-width');
 const header=[...calendar.querySelectorAll('thead th[data-date]')]
  .find(th=>th.dataset.date===weekStart);
 if(!header)return false;
 const frozenWidth=frozenHeaderWidth(calendar);
 const target=()=>scroller.scrollLeft+header.getBoundingClientRect().left-
  scroller.getBoundingClientRect().left-frozenWidth;
 const desired=target();
 const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
 // The old 42-day calendar could reach the desired offset on narrow screens,
 // but not on wide screens: scrollLeft was clamped before the current Monday.
 if(desired>max&&calendar.querySelector('thead th.calendar-tail')){
  const existing=Number.parseFloat(calendar.style.getPropertyValue('--calendar-trailing-width'))||0;
  calendar.style.setProperty('--calendar-trailing-width',
   Math.ceil(existing+desired-max+2)+'px');
 }
 // Re-read geometry after extending the last blank column.
 const newMax=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
 scroller.scrollLeft=Math.max(0,Math.min(target(),newMax));
 return true;
}

// The timetable is the ONLY wheel-to-horizontal zone. The patient data columns,
// empty spacer and other table parts retain normal vertical page scrolling.
export function isCalendarDateWheelTarget(calendar,target){
 if(!calendar||!target||!calendar.contains(target))return false;
 const cell=target.closest?.('td.day[data-date],thead th[data-date]');
 return Boolean(cell&&calendar.contains(cell));
}

// macOS trackpads expose two independent wheel axes. Leave both native across
// the ENTIRE calendar: horizontal gestures pan dates, vertical gestures scroll
// the page. Device type is not reliably exposed by WheelEvent, so use macOS
// platform detection instead of a fragile delta/pixel wheel heuristic.
export function calendarNativeTrackpadAxes(env=typeof navigator==='undefined'?null:navigator){
 const platform=String(env?.userAgentData?.platform||env?.platform||'');
 return /mac/i.test(platform)||/Macintosh|Mac OS X/i.test(String(env?.userAgent||''));
}

// Windows/Linux: a traditional vertical mouse wheel becomes horizontal over
// session/date cells only. macOS: do not intercept either native trackpad axis.
// Browser zoom gestures and horizontal gestures over dates remain native.
export function enableCalendarHorizontalWheel(calendar,{nativeAxes=calendarNativeTrackpadAxes()}={}){
 const scroller=calendar?.closest('.scroll');
 if(!scroller?.addEventListener)return false;
 if(nativeAxes)return true; // Native horizontal anywhere; native vertical anywhere.
 scroller.addEventListener('wheel',event=>{
  if(event.ctrlKey||event.metaKey)return; // Keep browser zoom gestures.
  if(!isCalendarDateWheelTarget(calendar,event.target)){
   if(Math.abs(event.deltaX)>Math.abs(event.deltaY)&&event.cancelable)
    event.preventDefault(); // Avoid horizontal movement over ФИО/контакты.
   return;
  }
  if(!event.deltaY||Math.abs(event.deltaX)>1)return;
  const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
  if(max<=0)return;
  const factor=event.deltaMode===1?16:event.deltaMode===2?scroller.clientWidth:1;
  const before=scroller.scrollLeft;
  scroller.scrollLeft=Math.max(0,Math.min(before+event.deltaY*factor,max));
  if(scroller.scrollLeft!==before&&event.cancelable)event.preventDefault();
 },{passive:false});
 return true;
}
