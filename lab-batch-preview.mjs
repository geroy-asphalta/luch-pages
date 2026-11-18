// Prepare a non-mutating preview for explicit bulk lab actions in the demo calendar.
// Clinical orders and already issued referrals are not changed automatically.
import {action} from './planner.mjs';

export function labBatchDraft(state,cells,kind){
 if(!['lab-assign','lab-remove'].includes(kind))return {error:'Недопустимая операция с анализами.'};
 const unique=new Map();
 for(const cell of cells||[]){
   if(!cell?.patientId||!cell?.date)continue;
   unique.set(cell.patientId+'|'+cell.date,{patientId:cell.patientId,date:cell.date});
 }
 if(!unique.size)return {error:'Выбери ячейки пациентов в календаре.'};
 const outcome=action(state,[...unique.values()],kind);
 const entries=(outcome.state.audit||[]).slice((state.audit||[]).length).map(item=>{
   const course=outcome.state.patients.find(p=>p.id===item.patientId);
   return {patientId:item.patientId,patientName:course?.name||item.patientId,
     courseName:course?.courseName||'Курс',date:item.day,previousStatus:item.old||'none'};
 });
 return {...outcome,error:null,kind,total:unique.size,unchanged:unique.size-outcome.changed,entries};
}

/**
 * One-button behavior: prioritize adding missing labs in mixed selections.
 * Remove pending labs immediately only when nothing needs to be added.
 * Issued referrals are never modified by either operation.
 */
export function labSingleButtonDraft(state,cells){
 const assignment=labBatchDraft(state,cells,'lab-assign');
 if(assignment.error||assignment.changed)return assignment;
 const removal=labBatchDraft(state,cells,'lab-remove');
 return removal.error?assignment:removal.changed?removal:assignment;
}
