// UI-only preference, separate from patient and treatment records.
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
