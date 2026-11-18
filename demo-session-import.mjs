// Source: synthetic Google Sheet "Талбичка", final tab "yjz,hm26",
// rows 2–14 above the magenta separator (row 20), read 2026-11-15.
// These are *schedule inferences*, not evidence of clinical delivery.
// The first numbered cell of each row anchors the number of earlier workdays;
// the final numbered cell checks the inferred course end.
import {addDays,schedule} from './planner.mjs';
import {isWorkingDay} from './work-calendar.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const BASE_CALENDAR={productionRegion:'RU',calendarDays:[]};
export const ROSTER_SESSION_INFERENCE_VERSION='talbichka-session-starts-2026-v1';
export const ROSTER_SESSION_EVIDENCE=Object.freeze([
 {name:'Клюбин',row:2, first:'2026-10-26',number:16,last:'2026-11-19',total:33},
 {name:'Сандалов',row:3, first:'2026-10-26',number:8,last:'2026-11-24',total:28},
 {name:'Федулов',row:4, first:'2026-10-26',number:5,last:'2026-11-17',total:20},
 {name:'Макасеев',row:5, first:'2026-10-26',number:6,last:'2026-11-26',total:28},
 {name:'Прохоров',row:6, first:'2026-10-29',number:6,last:'2026-12-02',total:28},
 {name:'Виноградов',row:7, first:'2026-10-29',number:6,last:'2026-11-19',total:20},
 {name:'Данилов',row:8, first:'2026-10-29',number:6,last:'2026-11-19',total:20},
 {name:'Булычев',row:9, first:'2026-10-29',number:6,last:'2026-11-19',total:20},
 {name:'Рогозинский',row:10,first:'2026-10-29',number:4,last:'2026-11-23',total:20},
 {name:'Шаламай',row:11,first:'2026-10-26',number:6,last:'2026-11-16',total:20},
 {name:'Сафронов',row:12,first:'2026-10-29',number:4,last:'2026-11-23',total:20},
 {name:'Роганов',row:13,first:'2026-10-29',number:4,last:'2026-11-23',total:20},
 {name:'Трусов',row:14,first:'2026-11-06',number:1,last:'2026-12-07',total:22}
]);

export const SOURCE_MAINTENANCE_DATE='2026-11-30';
export const SOURCE_MAINTENANCE_MACHINE='Halcyon-kV';

// Unlike copied dates, the start is not on the sheet for twelve patients.
// Count the observed fraction backwards, skipping weekends and the federal
// holidays (including the nonworking 4 November) without consulting any
// physician-specific calendar overrides.
export function inferredFirstSession(evidence){
 if(!Number.isInteger(evidence?.number)||evidence.number<1)return null;
 let day=evidence.first,number=evidence.number,limit=0;
 if(!isWorkingDay(BASE_CALENDAR,day))return null;
 while(number>1&&limit++<366){
  day=addDays(day,-1);
  if(isWorkingDay(BASE_CALENDAR,day))number--;
 }
 return number===1?day:null;
}

const obsoleteSeedMaintenance=new Map([
 ['m1','2026-10-27|Halcyon-kV'],
 ['m2','2026-11-12|Halcyon-MV'],
 ['m3','2026-11-25|Halcyon-kV']
]);
function isUntouchedSeedMaintenance(entry){
 if(!entry||obsoleteSeedMaintenance.get(entry.id)!==entry.date+'|'+entry.machine)return false;
 const known=new Set(['id','date','machine','finalBeforeService']);
 return Object.keys(entry).every(key=>known.has(key))&&
   (!entry.finalBeforeService||entry.finalBeforeService.length===0);
}

const importedCourse=(s,index)=>{
 const id=String(index+1).padStart(3,'0');
 return (s.patients||[]).find(c=>c.id==='C-ROSTER-'+id&&c.personId==='P-'+id);
};

// Remove only the boilerplate note written by the earlier date-import version.
// Keep the inferred date and its needsConfirmation flag in startInference, and
// preserve any real note appended later by the operator.
export const INFERRED_START_AUTONOTE='Дата начала восстановлена по номерам сеансов в «Талбичке». Подтверди вручную.';
export function clearInferredStartAutoNotes(state){
 if(!Array.isArray(state?.patients))return state;
 let changed=false;
 const patients=state.patients.map(course=>{
  const note=course?.notes;
  if(course?.startInference?.source!=='Талбичка'||typeof note!=='string'||
     !note.startsWith(INFERRED_START_AUTONOTE))return course;
  const tail=note.slice(INFERRED_START_AUTONOTE.length);
  // Anything resembling a different, manually rewritten sentence is left alone.
  if(tail&&!/^[\s·;\n]/.test(tail))return course;
  const remaining=tail.replace(/^[\s·;\n]+/,'').trim();
  changed=true;
  return {...course,notes:remaining};
 });
 return changed?{...state,patients}:state;
}

export function applyInferredDemoSessionDates(original){
 const next=copy(original);
 next.maintenance??=[];
 // Seeded dummy TO events from the original app would shift the imported
 // dates. Archive only the exact untouched demo records; keep custom TO.
 const legacy=next.maintenance.filter(isUntouchedSeedMaintenance);
 if(legacy.length){
  next.maintenance=next.maintenance.filter(x=>!isUntouchedSeedMaintenance(x));
  next.rosterImportArchive??={};
  next.rosterImportArchive.seedMaintenance=legacy;
 }
 // The source explicitly shows "ТО" in Prokhorov's row on 30 November.
 // This is a proposed machine maintenance day, not a treatment or delivery.
 const prokhorov=importedCourse(next,4);
 if(prokhorov&&Number(prokhorov.total)===28&&!next.maintenance.some(x=>
  x.date===SOURCE_MAINTENANCE_DATE&&x.machine===SOURCE_MAINTENANCE_MACHINE)){
  next.maintenance.push({id:'m-import-tal-2026-11-30',
   date:SOURCE_MAINTENANCE_DATE,machine:SOURCE_MAINTENANCE_MACHINE,
   source:'talbichka',needsConfirmation:true,
   note:'ТО указано в строке Прохорова; проверить по фактическому графику'});
 }
 for(const [index,evidence] of ROSTER_SESSION_EVIDENCE.entries()){
  const course=importedCourse(next,index);
  if(!course||Number(course.total)!==evidence.total||course.start||
     !['active','planned'].includes(course.status))continue;
  const date=inferredFirstSession(evidence);
  if(!date)continue;
  course.start=date;
  course.startInference={source:'Талбичка',tab:'yjz,hm26',
   sourceRow:evidence.row,inferredDate:date,firstVisible:evidence.first,
   firstFraction:evidence.number,lastVisible:evidence.last,
   needsConfirmation:true};
 }
 // Warn rather than silently rewriting individually customized workdays,
 // downtime, or completed fractions that conflict with the source.
 for(const [index,evidence] of ROSTER_SESSION_EVIDENCE.entries()){
  const course=importedCourse(next,index);
  if(!course?.startInference||course.start!==course.startInference.inferredDate)continue;
  const plan=schedule(course,next,evidence.last);
  const first=plan.get(evidence.first),last=plan.get(evidence.last);
  if(first?.kind!=='session'||first.n!==evidence.number||
     last?.kind!=='session'||last.n!==evidence.total){
   course.startInference.warning='Текущие исключения календаря или ТО не совпадают с нумерацией в исходной таблице';
  }
 }
 next.sessionInferenceVersion=ROSTER_SESSION_INFERENCE_VERSION;
 return next;
}
