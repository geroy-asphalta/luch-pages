// Read-only extraction from the user's explicitly fictional Google Sheet "Талбичка".
// Last tab "yjz,hm26", cells within rows 2–14 above the magenta separator.
// Solid red RGB(255,0,0) and light pink RGB(234,153,153) ONLY.
// The Google Sheet has no status legend in these cells: map dark red to LUCH's
// "issued" and pale pink to "todo" by UI analogy, with verificationRequired.
// This imports ADMINISTRATIVE reminders; it is not proof that blood was drawn
// or that a referral was issued. Operator can correct the statuses in LUCH.
import {schedule} from './planner.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
export const LAB_COLOR_IMPORT_VERSION='talbichka-last-tab-labs-2026-v1';

// Each tuple: Google Sheet row, day, numbered fraction, cell fill.
// No yellow weekends, blue marks, green finals or entries below row 14.
export const IMPORTED_LAB_COLOR_CELLS=Object.freeze([
 [3,'2026-11-11',19,'red'],[3,'2026-11-20',26,'pink'],
 [4,'2026-11-03',11,'red'],[4,'2026-11-13',18,'red'],
 [5,'2026-10-30',10,'red'],[5,'2026-11-12',18,'red'],[5,'2026-11-24',26,'pink'],
 [6,'2026-11-06',11,'red'],[6,'2026-11-16',17,'red'],[6,'2026-11-26',25,'pink'],
 [7,'2026-11-06',11,'red'],[7,'2026-11-17',18,'pink'],
 [8,'2026-11-05',10,'red'],[8,'2026-11-16',17,'red'],
 [9,'2026-11-05',10,'red'],[9,'2026-11-17',18,'pink'],
 [10,'2026-11-10',11,'red'],[10,'2026-11-19',18,'pink'],
 [11,'2026-11-02',11,'red'],[11,'2026-11-12',18,'red'],
 [12,'2026-11-10',11,'red'],[12,'2026-11-18',17,'pink'],
 [13,'2026-11-11',12,'red'],[13,'2026-11-19',18,'pink'],
 [14,'2026-12-02',19,'pink']
].map(([sourceRow,date,fraction,color])=>Object.freeze({sourceRow,date,fraction,color})));

export function installImportedLabColors(previous){
 if(previous?.labColorImportVersion===LAB_COLOR_IMPORT_VERSION)return previous;
 if(!previous||!Array.isArray(previous.patients)||!Array.isArray(previous.events))return previous;
 const next=clone(previous);
 let added=0,existing=0,skipped=0;
 for(const mark of IMPORTED_LAB_COLOR_CELLS){
  const index=mark.sourceRow-1,pad=String(index).padStart(3,'0');
  const id='C-ROSTER-'+pad,personId='P-'+pad;
  const course=next.patients.find(p=>p.id===id&&p.personId===personId);
  if(!course){skipped++;continue}
  // Never erase or override an existing manual reminder (including cancelled).
  if(next.events.some(e=>e.patientId===id&&e.date===mark.date&&e.type==='lab')){
   existing++;continue;
  }
  const planned=schedule(course,next,mark.date).get(mark.date);
  const matching=planned?.kind==='session'&&planned.n===mark.fraction;
  next.events.push({
   id:'tal-lab-'+pad+'-'+mark.date,
   patientId:id,date:mark.date,type:'lab',
   status:mark.color==='red'?'issued':'todo',
   issueRestore:'todo',
   source:'talbichka-cell-color',
   sourceColor:mark.color,sourceRow:mark.sourceRow,sourceFraction:mark.fraction,
   verificationRequired:true,
   ...(matching?{}:{scheduleWarning:'Номер фракции в текущем курсе не совпадает с исходной таблицей'})
  });
  added++;
 }
 next.labColorImportVersion=LAB_COLOR_IMPORT_VERSION;
 next.labColorImportSummary={added,existing,skipped,statusUnverified:true};
 return next;
}
