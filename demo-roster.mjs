// A one-time replacement of the browser-local DEMO roster from the last tab
// of the user's explicitly fictional spreadsheet "Талбичка".
// Rows 2–14 only; rows below the magenta divider at row 20 are excluded.
// Import the displayed surname and final fraction number; machine assignments
// (12 × Halcyon-kV, Trusov × Gulmay) were explicitly supplied by the operator.
// Session dates are reconstructed separately from the explicit numbers in the
// source sheet. They do not confirm delivery, dose or chemotherapy.
import {seed} from './planner.mjs';
import {applyInferredDemoSessionDates,clearInferredStartAutoNotes} from './demo-session-import.mjs';

const PREVIOUS_ROSTER_IMPORT_VERSION='talbichka-last-tab-13-v1';
const SECOND_ROSTER_IMPORT_VERSION='talbichka-last-tab-13-v2';
const THIRD_ROSTER_IMPORT_VERSION='talbichka-last-tab-13-v3';
export const ROSTER_IMPORT_VERSION='talbichka-last-tab-13-v4';

// Preserve the exact source order. Fraction totals are the largest numbers
// present in each source row, including the December columns.
export const IMPORTED_DEMO_PATIENTS=Object.freeze([
 {name:'Клюбин',total:33},
 {name:'Сандалов',total:28},
 {name:'Федулов',total:20},
 {name:'Макасеев',total:28},
 {name:'Прохоров',total:28},
 {name:'Виноградов',total:20},
 {name:'Данилов',total:20},
 {name:'Булычев',total:20},
 {name:'Рогозинский',total:20},
 {name:'Шаламай',total:20},
 {name:'Сафронов',total:20},
 {name:'Роганов',total:20},
 {name:'Трусов',total:22}
]);

function suggestedFields(total){
 // Only mappings explicitly approved by the operator, not clinical orders.
 if(total===20)return {diagnosis:'C61',ctv:'Prost 3Gy',treatmentType:'ЛТ'};
 if(total===28)return {diagnosis:'C61',ctv:'Prost + LN',treatmentType:'ЛТ'};
 if(total===22)return {diagnosis:'',ctv:'БФРТ',treatmentType:'ЛТ'};
 if(total===33)return {diagnosis:'C67',ctv:'Blad 2Gy',treatmentType:'ХЛТ'};
 return {diagnosis:'',ctv:'',treatmentType:'ЛТ'}; // no unapproved mappings
}
const clone=value=>JSON.parse(JSON.stringify(value));
const machineForImportedName=name=>name==='Трусов'?'Gulmay':'Halcyon-kV';

// Reset action and first-time users get the same 13 people with reconstructed
// schedule dates. Medical dose and chemotherapy plans remain unconfirmed.
export function createImportedDemoState(){
 const base=seed(); // retain only the stable demo schema and production region
 const createdAt=new Date().toISOString();
 const people=IMPORTED_DEMO_PATIENTS.map(({name},index)=>({
  id:'P-'+String(index+1).padStart(3,'0'),name,eln:'',phone:'',notes:'',
  archived:false,displayOrder:index,createdAt
 }));
 const patients=IMPORTED_DEMO_PATIENTS.map(({name,total},index)=>({
  id:'C-ROSTER-'+String(index+1).padStart(3,'0'),
  personId:people[index].id,name:people[index].name,courseName:'Курс 1',
  ...suggestedFields(total),
  machine:machineForImportedName(name),start:'',total,dose:null,sod:null,displayDose:false,
  boost:false,doseZones:[],status:'planned',notes:'',tt:false,ttDate:''
 }));
 return applyInferredDemoSessionDates({...base,patients,people,events:[],calendarDays:[],breakdowns:[],
  transfers:[],maintenance:[],audit:[],rosterImportVersion:ROSTER_IMPORT_VERSION});
}

// First migrate v1 names/CTV without erasing user edits; machine assignments
// are handled in the explicit v3 equipment update below.
function upgradePreviousImportedRoster(previous){
 const next=clone(previous);
 const originalNames=[
  'клюбин','сандалов','федулов','макасеев','прохоров','виноградов',
  'данилов','булычев','рогозинский','шаламай','сафронов','роганов','Трусов'
 ];
 for(const [index,{name,total}] of IMPORTED_DEMO_PATIENTS.entries()){
  const personId='P-'+String(index+1).padStart(3,'0');
  const person=(next.people||[]).find(p=>p.id===personId);
  if(person&&String(person.name||'').toLocaleLowerCase('ru-RU')===originalNames[index].toLocaleLowerCase('ru-RU')){
   person.name=name;
   for(const course of next.patients||[]){
    if(course.personId===personId)course.name=name;
   }
  }
  if(total!==28)continue;
  const course=(next.patients||[]).find(c=>
   c.id==='C-ROSTER-'+String(index+1).padStart(3,'0')&&
   c.personId===personId);
  if(!course||Number(course.total)!==28||course.ctv||course.diagnosis)continue;
  course.ctv='Prost + LN';
  course.diagnosis='C61';
 }
 next.rosterImportVersion=SECOND_ROSTER_IMPORT_VERSION;
 return next;
}

// The operator explicitly chose equipment for all 13 original courses.
// Update the machine on those specific courses, never any subsequently added
// courses; leave their other fields, events and display order unchanged.
function upgradeRosterMachines(previous){
 const next=clone(previous);
 for(const [index,{name}] of IMPORTED_DEMO_PATIENTS.entries()){
  const number=String(index+1).padStart(3,'0');
  const course=(next.patients||[]).find(c=>
   c.id==='C-ROSTER-'+number&&c.personId==='P-'+number);
  if(course)course.machine=machineForImportedName(name);
 }
 next.rosterImportVersion=THIRD_ROSTER_IMPORT_VERSION;
 return next;
}

function upgradeInferredDates(previous){
 const next=clearInferredStartAutoNotes(applyInferredDemoSessionDates(previous));
 next.rosterImportVersion=ROSTER_IMPORT_VERSION;
 return next;
}

// This is intentionally a ONE-TIME upgrade of every old local demo roster.
// Afterwards normal patient edits persist across reloads. Preserve unrelated
// locally configured CTV templates (including C20/C44), workdays, and equipment
// events, but scrub all references to the removed patient/course IDs.
export function installImportedDemoRoster(previous){
 if(previous?.rosterImportVersion===ROSTER_IMPORT_VERSION)return clearInferredStartAutoNotes(previous);
 if(previous?.rosterImportVersion===THIRD_ROSTER_IMPORT_VERSION)
  return upgradeInferredDates(previous);
 if(previous?.rosterImportVersion===SECOND_ROSTER_IMPORT_VERSION)
  return upgradeInferredDates(upgradeRosterMachines(previous));
 if(previous?.rosterImportVersion===PREVIOUS_ROSTER_IMPORT_VERSION)
  return upgradeInferredDates(upgradeRosterMachines(upgradePreviousImportedRoster(previous)));
 const next=createImportedDemoState();
 if(!previous||typeof previous!=='object'||!Array.isArray(previous.patients))
  return next;
 for(const field of ['ctvCatalog','productionRegion','calendarDays']){
  if(previous[field]!==undefined)next[field]=clone(previous[field]);
 }
 if(Array.isArray(previous.maintenance)){
  next.maintenance=clone(previous.maintenance).map(item=>({
   ...item,finalBeforeService:[] // all old course IDs become invalid
  }));
 }
 if(Array.isArray(previous.breakdowns)){
  next.breakdowns=clone(previous.breakdowns).map(item=>({
   ...item,completed:[] // previous patients cannot be delivered in new roster
  }));
 }
 // Intentionally drop all prior patient events, transfers, and audit history.
 // They refer to records the operator requested to remove. Reconcile retained
 // equipment service with the verified source dates, not dummy seed service.
 return upgradeInferredDates(next);
}
