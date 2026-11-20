// Read-only presentation metrics for patient course progress bars.
// A calendar-elapsed procedure is never labelled a confirmed clinical fact.
import {courseProgress,localToday} from './course-progress.mjs';
import {chemoAdministrationSummary} from './chemo-administration.mjs';

const count=(value,max)=>Math.min(max,Math.max(0,Number.isFinite(Number(value))?Number(value):0));
const total=value=>Math.max(0,Number.isFinite(Number(value))?Math.trunc(Number(value)):0);
function metric(expected,administrative,confirmed){
 const max=total(expected);
 const verified=count(confirmed,max);
 const counted=Math.max(verified,count(administrative,max));
 return {
  total:max,counted,confirmed:Math.min(verified,counted),
  inferred:Math.max(0,counted-verified),
  confirmedPercent:max?100*verified/max:0,
  inferredPercent:max?100*(counted-verified)/max:0
 };
}

export function courseCardProgress(state,course,today=localToday()){
 const radiation=courseProgress(state,course,today);
 const early=course.earlyDischarge;
 const radiationConfirmed=early?.explicitlyRecorded??radiation.explicit;
 const lt=metric(radiation.total,radiation.completed,radiationConfirmed);
 if(course.treatmentType!=='ХЛТ')return {lt,chemo:null};

 const infusions=chemoAdministrationSummary(state,course.id,today);
 const chemo=metric(infusions.total,infusions.completed,infusions.confirmed);
 return {lt,chemo};
}
