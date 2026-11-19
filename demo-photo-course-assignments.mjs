// One-time, non-destructive administrative import from the operator-supplied
// fictional apparatus column (19 November). These are COURSE DRAFTS only:
// no dates, delivered fractions, chemotherapy administrations or lab referrals.
// Never modify an existing course or overwrite manual edits.
import {MACHINES} from './planner.mjs';
import {baseTemplates} from './ctv-catalog.mjs';

export const PHOTO_COURSE_VERSION='fictional-course-apparatus-2026-11-19-v1';
const HALCYON='Halcyon-kV'; // "Halc" in the source image
export const PHOTO_COURSE_ROWS=Object.freeze([
 {name:'Коровашков Александр Леонидович',diagnosis:'C61',ctv:'Prost 3Gy',total:20,rod:[3],treatmentType:'ЛТ'},
 {name:'Константинов Алексей Николаевич',diagnosis:'C61',ctv:'Prost 3Gy',total:20,rod:[3],treatmentType:'ЛТ'},
 {name:'Царев Сергей Николаевич',diagnosis:'C61',ctv:'Prost + LN',total:28,rod:[1.8,2.5],treatmentType:'ЛТ'},
 {name:'Лазарев Дмитрий Владимирович',diagnosis:'C61',ctv:'Prost + LN',total:28,rod:[1.8,2.5],treatmentType:'ЛТ'},
 {name:'Сайфетдинов Аняс Андержанович',diagnosis:'C61',ctv:'Prost + LN',total:28,rod:[1.8,2.5],treatmentType:'ЛТ'},
 {name:'Павлов Евгений Валентинович',diagnosis:'C67.2',ctv:'Blad 2Gy',total:33,rod:[2],treatmentType:'ХЛТ'}
].map(row=>Object.freeze({...row,machine:HALCYON,rod:Object.freeze(row.rod)})));

const clone=value=>JSON.parse(JSON.stringify(value));
const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ');
const courseIdFor=id=>'C-PHOTO-20261119-'+id;
const referenceTemplates=baseTemplates();

export function installPhotoCourseAssignments(previous){
 if(previous?.photoCourseVersion===PHOTO_COURSE_VERSION)return previous;
 if(!previous||!Array.isArray(previous.people)||!Array.isArray(previous.patients))return previous;

 const next=clone(previous),added=[],skipped=[];
 for(const row of PHOTO_COURSE_ROWS){
   const persons=next.people.filter(p=>normalize(p.name)===normalize(row.name));
   if(persons.length!==1){skipped.push({name:row.name,reason:'Карточка отсутствует или имя неоднозначно'});continue;}
   const person=persons[0];
   if(person.archived){skipped.push({name:row.name,reason:'Пациент в архиве'});continue;}
   if(next.patients.some(c=>c.personId===person.id)){
     skipped.push({name:row.name,reason:'Уже есть курс (не изменять без проверки)'});continue;
   }
   const reference=referenceTemplates.find(t=>t.name===row.ctv&&t.group===row.diagnosis.slice(0,3));
   if(!reference||reference.fractions!==row.total||!MACHINES.includes(row.machine)){
     skipped.push({name:row.name,reason:'Шаблон или аппарат не совпадает со справочником'});continue;
   }
   const zones=reference.zones||[];
   if(zones.length!==row.rod.length){
     skipped.push({name:row.name,reason:'Число зон в шаблоне не совпадает'});continue;
   }
   const courseId=courseIdFor(person.id);
   if(next.patients.some(c=>c.id===courseId)){
     skipped.push({name:row.name,reason:'ID курса уже занят'});continue;
   }
   const course={
     id:courseId,personId:person.id,name:person.name,courseName:'Курс 1',
     diagnosis:row.diagnosis,ctv:reference.name,ctvTemplateId:reference.id,
     machine:row.machine,start:'',total:row.total,
     dose:zones.length===1?row.rod[0]:null,sod:null,
     doseZones:zones.length>1?zones.map((zone,i)=>({label:zone.label,rod:row.rod[i],sod:null})):[],
     displayDose:false,boost:false,status:'planned',
     treatmentType:row.treatmentType,tt:false,ttDate:'',notes:'',
     // HLT type is recorded, but count/date of chemotherapy were NOT supplied.
     // It must be set and confirmed by the physician in the course editor.
     chemo:null,
     importReview:{source:PHOTO_COURSE_VERSION,needsConfirmation:true,
       note:'Аппарат, CTV, число фракций и РОД со снимка; дата ЛТ/СОД/ХТ не назначены'}
   };
   next.patients.push(course);
   added.push(course.id);
 }
 next.photoCourseVersion=PHOTO_COURSE_VERSION;
 next.photoCourseImport={added,skipped};
 (next.audit??=[]).push({date:new Date().toISOString(),kind:'patient-photo-course',
   detail:'Демонстрационные схемы по снимку: создано '+added.length+
     ' плановых курсов без дат; пропущено '+skipped.length+'. ХТ и анализы не назначены.'});
 return next;
}
