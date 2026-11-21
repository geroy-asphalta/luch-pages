// UI-only preference, separate from patient and treatment records.
// Simple outlined handset, shared by the header and collapsed patient rows.
// It is presentation-only, with no telephone link or data mutation.
export const calendarPhoneHandsetIcon='<svg class="calendar-phone-handset" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+
 '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>'+
 '</svg>';
export const PHONE_VISIBILITY_KEY='luch-calendar-phone-expanded-v1';
export function initialPhoneExpanded(storage,compactScreen=false){
 try{
  const value=storage?.getItem(PHONE_VISIBILITY_KEY);
  if(value==='true')return true;
  if(value==='false')return false;
 }catch{}
 return !compactScreen;
}
export function savePhoneExpanded(storage,expanded){
 try{storage?.setItem(PHONE_VISIBILITY_KEY,String(Boolean(expanded)));}catch{}
 return Boolean(expanded);
}
