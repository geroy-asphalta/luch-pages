// Presentation-only wrench for a scheduled maintenance day; the planning model is unchanged.
export const maintenanceWrenchSvg='<svg class="calendar-maintenance-wrench" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+
 '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>'+
 '</svg>';

export function calendarMaintenanceCellContent({isMaintenance=false,hasTreatmentEvent=false,content=''}={}){
 if(!isMaintenance)return content;
 if(hasTreatmentEvent)return content+'<span class="calendar-maintenance-corner" role="img" aria-label="ТО">'+maintenanceWrenchSvg+'</span>';
 return '<span class="calendar-maintenance-symbol" role="img" aria-label="Техническое обслуживание">'+maintenanceWrenchSvg+'</span>';
}
