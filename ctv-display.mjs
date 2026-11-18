// Resolve a historical CTV label to the current catalog name for display only.
// Catalog aliases keep older course names linked after a template is renamed.
// Never overwrite stored course parameters or imply a revised prescription.
import {catalogTemplateByName,catalogTemplateById} from './ctv-catalog.mjs';

export function currentCtvName(state,courseOrName){
 const course=typeof courseOrName==='string'?null:courseOrName;
 const original=String((course?course.ctv:courseOrName)??'').trim();
 if(!original)return '';
 const template=course?.ctvTemplateId?
  catalogTemplateById(state,course.ctvTemplateId):catalogTemplateByName(state,original);
 if(!template)return original; // Manually entered CTV stays untouched.
 // For an unlinked historical name, never relabel it using another diagnosis group.
 if(course&&!course.ctvTemplateId&&course.diagnosis&&
    String(course.diagnosis).slice(0,3).toUpperCase()!==template.group)return original;
 return template.name;
}
