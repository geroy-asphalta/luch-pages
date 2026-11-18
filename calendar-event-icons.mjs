// Presentation-only icons for calendar blood tests and planned chemotherapy.
// This module does not schedule, complete or otherwise modify medical events.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

export const bloodTubeIcon='<svg class="calendar-event-icon calendar-event-icon--blood" viewBox="0 0 32 40" fill="none" aria-hidden="true" focusable="false">'+
 '<rect x="8" y="3" width="16" height="5.5" rx="2.5" fill="#FBE4EE" stroke="#B34470" stroke-width="2.4"/>'+
 '<path d="M10 8.5v23a6 6 0 0 0 12 0v-23" fill="#FFF7FA" stroke="#B34470" stroke-width="2.4" stroke-linejoin="round"/>'+
 '<path d="M10 23q3-2.5 6 0t6 0v8.5a6 6 0 0 1-12 0Z" fill="#CF5982"/>'+
 '<path d="M17 27h3M17 31h3" stroke="#FFF" stroke-width="1.8" stroke-linecap="round"/>'+
 '</svg>';

export const chemoInfusionIcon='<svg class="calendar-event-icon calendar-event-icon--chemo" viewBox="0 0 36 42" fill="none" aria-hidden="true" focusable="false">'+
 '<path d="M3 38V15a5 5 0 0 1 5-5h4" stroke="#13869F" stroke-width="2.4" stroke-linecap="round"/>'+
 '<path d="M18 4h8" stroke="#13869F" stroke-width="2.3" stroke-linecap="round"/>'+
 '<circle cx="22" cy="5.5" r="3" fill="#F1FBFE" stroke="#13869F" stroke-width="2.1"/>'+
 '<rect x="12" y="10" width="21" height="26" rx="5" fill="#F4FCFE" stroke="#13869F" stroke-width="2.4"/>'+
 '<path d="M13 23q5-4 10 0t9 0v8a5 5 0 0 1-5 5h-9a5 5 0 0 1-5-5Z" fill="#A5DDEB"/>'+
 '<path d="M27 25h4M27 29h4M22 36v3q0 2 2 2" stroke="#13869F" stroke-width="1.7" stroke-linecap="round"/>'+
 '</svg>';

/**
 * Large icons take priority over a fraction number only for event days.
 * Non-event cells keep their previous label; "issued" referrals still show the tube.
 */
export function calendarTreatmentCellContent({label='',isSession=false,labStatus=null,chemoPlanned=false}={}){
 if(!labStatus&&!chemoPlanned)return escapeHtml(label);
 const icons=(labStatus?bloodTubeIcon:'')+(chemoPlanned?chemoInfusionIcon:'');
 const both=labStatus&&chemoPlanned?' calendar-treatment-events--both':'';
 const fraction=isSession&&label!==''?'<span class="calendar-fraction-small">'+escapeHtml(label)+'</span>':'';
 const statusLabel=!isSession&&label!==''?'<span class="calendar-event-status-label">'+escapeHtml(label)+'</span>':'';
 return '<span class="calendar-treatment-events'+both+'" aria-hidden="true">'+icons+'</span>'+fraction+statusLabel;
}
