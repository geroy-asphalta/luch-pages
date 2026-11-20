// Presentation-only short patient name for the compact radiotherapy calendar.
// Full patient name remains unchanged in patient records and detail drawer.
export function compactCalendarPatientName(value){
 const name=String(value??'').trim().replace(/\s+/g,' ');
 if(!name)return '';
 const tokens=name.split(' ');
 if(tokens.length===1)return name;
 const initials=tokens.slice(1,3).map(token=>token.charAt(0).toLocaleUpperCase('ru-RU')+'.').join('');
 return tokens[0]+' '+initials;
}

/* Split the existing calendar labels for typography only. Patient data and
   full-name tooltips remain unchanged; no clinical fields are altered. */
export function calendarPatientNameParts(value){
 const full=String(value??'').trim().replace(/\s+/g,' ');
 const surname=full.split(' ')[0]||'';
 const compact=compactCalendarPatientName(full);
 return {
  surname,
  compactRemainder:compact.slice(surname.length).trim(),
  fullRemainder:full.slice(surname.length).trim()
 };
}
