// Compact ELN status for the calendar's patient-name column.
// Presentation only; the saved patient value remains "Да", "Нет" or empty.
export function calendarElnIndicator(value){
 const status=String(value??'').trim();
 const state=status==='Да'?'yes':status==='Нет'?'no':'unknown';
 const label=state==='yes'?'ЭЛН: есть':state==='no'?'ЭЛН: нет':'ЭЛН: не указано';
 return '<span class="calendar-eln-indicator calendar-eln-'+state+'" role="img" aria-label="'+label+'" title="'+label+'">ЭЛН</span>';
}
