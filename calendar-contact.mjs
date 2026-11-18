// Presentation-only projection: no duplicates, writes or treatment-plan changes.
export function calendarContact(state,course){
 const person=(state.people||[]).find(p=>p.id===course.personId);
 const eln=String(person?.eln||'').trim();
 const phone=String(person?.phone||'').trim();
 const notes=[person?.notes,course?.notes].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
 return {eln,phone,notes};
}
