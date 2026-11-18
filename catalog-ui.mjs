// Local-only, synthetic CTV catalog editor. No patient medical records should be entered here.
import {ICD_C_GROUPS,ICD_C_FAVORITES} from './clinical-dictionaries.mjs';
import {catalogTemplates,catalogTemplateById,saveCatalogTemplateDraft,setCatalogTemplateHiddenDraft,resetBuiltinTemplateDraft,templateDoseDiscrepancies} from './ctv-catalog.mjs';
import {asDoseText} from './dose-zones.mjs';
import {catalogGroupedTemplates,catalogDoseSummary} from './catalog-view.mjs';

const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=v=>v==null?'':String(v); // HTML number inputs require a dot decimal separator.
const show=n=>n==null?'—':asDoseText(n);
const order=['C61','C67','C50'];
const groupOptions=[...ICD_C_GROUPS].sort((a,b)=>(order.indexOf(a.code)<0?999:order.indexOf(a.code))-(order.indexOf(b.code)<0?999:order.indexOf(b.code))||a.code.localeCompare(b.code));
const opt=(v,t,selected)=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(t)+'</option>';
export function createCatalogUI({getState,commitState,renderApp,notice}){
 let search='',showHidden=false,editing=null,pending=null;
 let openedGroup=null,selectedId=null;
 const searchClosedGroups=new Set();
 const active=()=>catalogTemplates(getState(),{includeHidden:showHidden});
 function filterList(){
  const state=getState(),hidden=new Set(state.ctvCatalog?.hidden||[]);
  const overrides=state.ctvCatalog?.overrides||{};
  const groups=catalogGroupedTemplates(active(),search);
  const isSearching=Boolean(search.trim());
  const list=el('ctv-catalog-list');
  const selected=groups.flatMap(g=>g.items).find(t=>t.id===selectedId)||null;
  const itemLine=t=>{
   const modified=t.builtin&&Boolean(overrides[t.id]),isHidden=hidden.has(t.id);
   const tags=(modified?'<small class="catalog-entry-tag">Изменён</small>':
    !t.builtin?'<small class="catalog-entry-tag">Свой</small>':'')+
    (isHidden?'<small class="catalog-entry-tag">Скрыт</small>':'');
   const active=t.id===selectedId;
   return '<button type="button" class="catalog-entry'+(active?' catalog-entry-active':'')+'"'+
    ' data-catalog-select="'+esc(t.id)+'" aria-pressed="'+active+'" title="Просмотреть '+esc(t.name)+'">'+
    '<span class="catalog-entry-name">'+esc(t.name)+'</span>'+tags+
    '<span class="catalog-entry-chevron" aria-hidden="true">›</span></button>';
  };
  const groupsHtml=groups.map(g=>{
   const opened=isSearching?!searchClosedGroups.has(g.code):openedGroup===g.code;
   return '<section class="catalog-group">'+
    '<button type="button" class="catalog-group-header" data-catalog-group="'+esc(g.code)+'"'+
    ' aria-expanded="'+opened+'" aria-controls="catalog-group-'+esc(g.code)+'">'+
    '<span class="catalog-group-chevron" aria-hidden="true">'+(opened?'⌄':'›')+'</span>'+
    '<span class="catalog-group-code">'+esc(g.code)+'</span>'+
    '<span class="catalog-group-name">'+esc(g.name)+'</span>'+
    '<span class="catalog-group-count">'+g.items.length+'</span></button>'+
    (opened?'<div class="catalog-group-body" id="catalog-group-'+esc(g.code)+'">'+
     g.items.map(itemLine).join('')+'</div>':'')+
    '</section>';
  }).join('');
  let detail='';
  if(selected){
   const modified=selected.builtin&&Boolean(overrides[selected.id]);
   const isHidden=hidden.has(selected.id);
   const actions='<div class="catalog-detail-actions">'+
    '<button type="button" data-catalog-edit="'+esc(selected.id)+'">Изменить</button>'+
    '<button type="button" data-catalog-clone="'+esc(selected.id)+'">Копировать</button>'+
    '<button type="button" data-catalog-hide="'+esc(selected.id)+'">'+(isHidden?'Показать':'Скрыть')+'</button>'+
    (modified?'<button type="button" data-catalog-reset="'+esc(selected.id)+'">Исходные параметры</button>':'')+
    '</div>';
   detail='<section class="catalog-inspector">'+
    '<div class="catalog-inspector-header"><div><small>'+esc(selected.group)+' · CTV</small>'+
    '<h3>'+esc(selected.name)+'</h3></div>'+
    '<button type="button" class="catalog-inspector-close" data-catalog-dismiss aria-label="Закрыть сведения CTV" title="Закрыть">×</button></div>'+
    '<div class="catalog-inspector-facts">'+
    '<span><small>Фракций</small><b>'+esc(selected.fractions)+'</b></span>'+
    '<span><small>РОД, Гр</small><b>'+esc(catalogDoseSummary(selected,'rod'))+'</b></span>'+
    '<span><small>СОД, Гр</small><b>'+esc(catalogDoseSummary(selected,'sod'))+'</b></span></div>'+
    '<div class="catalog-inspector-zones"><h4>Зоны облучения</h4>'+
    selected.zones.map(z=>'<div><span>'+esc(z.label)+'</span><span>РОД '+show(z.rod)+' · СОД '+show(z.sod)+' Гр</span></div>').join('')+'</div>'+
    (selected.group==='C50'?'<p class="catalog-inspector-boost">Буст при выборе: РОД '+show(selected.boostRod)+' · СОД '+show(selected.boostSod)+' Гр</p>':'')+
    actions+'</section>';
  }
  list.innerHTML=groups.length?'<div class="catalog-index">'+groupsHtml+'</div>'+detail:
   '<div class="catalog-blank">CTV не найдены. Попробуй другой запрос или добавь шаблон.</div>';
 }
 function render(){
  filterList();
  el('ctv-catalog-list').parentElement.classList.toggle('catalog-editing',Boolean(editing));
  if(!editing)el('ctv-catalog-editor').classList.add('hidden');
 }
 function zoneRows(form,zones){
  const box=form.querySelector('#catalog-zones');
  box.innerHTML=zones.map((z,i)=>'<div class="catalog-zone" data-zone-index="'+i+'">'+
   '<label>Название зоны<input data-zone-field="label" maxlength="80" value="'+esc(z.label||'')+'" required></label>'+
   '<label>РОД, Гр<input data-zone-field="rod" type="number" min="0.01" max="30" step="any" placeholder="—" value="'+esc(txt(z.rod))+'"></label>'+
   '<label>СОД, Гр<input data-zone-field="sod" type="number" min="0.01" max="500" step="any" placeholder="—" value="'+esc(txt(z.sod))+'"></label>'+
   '<button type="button" data-remove-zone="'+i+'" aria-label="Удалить эту зону" '+(zones.length===1?'disabled':'')+'>×</button>'+
   '</div>').join('');
 }
 function values(form){
  const zones=[...form.querySelectorAll('.catalog-zone')].map(row=>({
   label:row.querySelector('[data-zone-field="label"]').value,
   rod:row.querySelector('[data-zone-field="rod"]').value,
   sod:row.querySelector('[data-zone-field="sod"]').value
  }));
  return {group:form.elements.group.value,name:form.elements.name.value,fractions:form.elements.fractions.value,
   zones,boostRod:form.elements.boostRod.value,boostSod:form.elements.boostSod.value};
 }
 function viewEditor(template=null,{clone=false}={}){
  pending=null;
  editing={id:clone?null:template?.id||null};
  const defaultGroup=openedGroup||'C61';
  const t=template?{...template,name:clone?template.name+' (копия)':template.name}:
    {name:'',group:defaultGroup,fractions:15,zones:[{label:'Зона облучения',rod:null,sod:null}],boostRod:3.2,boostSod:48};
  const pane=el('ctv-catalog-editor');pane.classList.remove('hidden');
  el('ctv-catalog-list').parentElement.classList.add('catalog-editing');
  pane.innerHTML='<div class="catalog-editor-header"><h3>'+(editing.id?'Изменить CTV':'Добавить CTV')+'</h3><button type="button" id="catalog-editor-close" aria-label="Закрыть редактор" title="Закрыть редактор">×</button></div>'+
   '<p class="muted">Изменения влияют на выбор шаблонов в новых карточках. У уже сохранённых курсов дозы и название остаются прежними, пока ты не изменишь их отдельно.</p>'+
   '<form id="catalog-form" class="catalog-form">'+
   '<label>Группа МКБ-10<select name="group">'+groupOptions.map(x=>opt(x.code,x.code+' · '+x.name,t.group)).join('')+'</select></label>'+
   '<label>Название CTV<input name="name" maxlength="100" required value="'+esc(t.name)+'" placeholder="Например, Prost + LN"></label>'+
   '<label>Количество фракций<input name="fractions" type="number" min="1" max="100" required value="'+esc(t.fractions)+'"></label>'+
   '<div class="catalog-zones-heading"><b>Зоны облучения</b><button type="button" id="catalog-add-zone">+ Добавить зону</button></div>'+
   '<div id="catalog-zones"></div>'+
   '<div class="catalog-boost-box" id="catalog-boost-box">'+
    '<b>При выборе «Буст» для C50</b><p class="muted">Эта зона добавляется дополнительно к основным, число фракций не увеличивается.</p>'+
    '<label>РОД буста, Гр<input name="boostRod" type="number" min="0.01" max="30" step="any" value="'+esc(txt(t.boostRod))+'"></label>'+
    '<label>СОД буста, Гр<input name="boostSod" type="number" min="0.01" max="500" step="any" value="'+esc(txt(t.boostSod))+'"></label>'+
   '</div>'+
   '<div class="catalog-form-actions"><button type="submit" class="primary">Проверить изменения</button><button type="button" id="catalog-cancel">Закрыть</button></div>'+
   '</form><div id="catalog-preview" class="catalog-preview hidden"></div>';
  const form=el('catalog-form');
  zoneRows(form,t.zones);
  const manualSod=new Set();
  let manualBoost=false;
  const dose=x=>{const n=Number(String(x||'').replace(',','.'));return Number.isFinite(n)&&n>0?n:null};
  const recompute=(only=null)=>{
   const fractions=dose(form.elements.fractions.value);
   [...form.querySelectorAll('.catalog-zone')].forEach((row,i)=>{
    if(only!==null&&only!==i)return;
    if(manualSod.has(i))return;
    const rod=dose(row.querySelector('[data-zone-field="rod"]').value);
    row.querySelector('[data-zone-field="sod"]').value=rod&&fractions?String(Math.round((rod*fractions+Number.EPSILON)*1000)/1000):'';
   });
   if(!manualBoost){
    const rod=dose(form.elements.boostRod.value);
    form.elements.boostSod.value=rod&&fractions?String(Math.round((rod*fractions+Number.EPSILON)*1000)/1000):'';
   }
  };
  const toggleBoost=()=>el('catalog-boost-box').classList.toggle('hidden',form.elements.group.value!=='C50');
  toggleBoost();
  form.elements.group.addEventListener('change',toggleBoost);
  form.elements.fractions.addEventListener('input',()=>recompute());
  form.elements.boostRod.addEventListener('input',()=>recompute());
  form.elements.boostSod.addEventListener('input',()=>{manualBoost=true;});
  el('catalog-zones').addEventListener('input',e=>{
   const row=e.target.closest('.catalog-zone');if(!row)return;
   const i=Number(row.dataset.zoneIndex);
   if(e.target.dataset.zoneField==='sod')manualSod.add(i);
   if(e.target.dataset.zoneField==='rod')recompute(i);
  });
  el('catalog-zones').addEventListener('click',e=>{
   const remove=e.target.closest('[data-remove-zone]');
   if(!remove)return;
   const data=values(form);if(data.zones.length<=1)return;
   data.zones.splice(Number(remove.dataset.removeZone),1);manualSod.clear();zoneRows(form,data.zones);
  });
  el('catalog-add-zone').onclick=()=>{
   const data=values(form);
   if(data.zones.length>=4){notice('Не более четырёх зон в одной схеме.');return;}
   data.zones.push({label:'Новая зона',rod:'',sod:''});manualSod.clear();zoneRows(form,data.zones);
  };
  const closeEditor=()=>{editing=null;pending=null;pane.classList.add('hidden');pane.innerHTML='';el('ctv-catalog-list').parentElement.classList.remove('catalog-editing');};
  el('catalog-cancel').onclick=closeEditor;
  el('catalog-editor-close').onclick=closeEditor;
  form.onsubmit=event=>{
   event.preventDefault();
   const draft=saveCatalogTemplateDraft(getState(),values(form),editing.id);
   if(draft.error){notice(draft.error);return;}
   pending=draft;
   const discrepancies=templateDoseDiscrepancies(draft.entry);
   const prev=el('catalog-preview');prev.classList.remove('hidden');
   prev.innerHTML='<h3>Проверка перед сохранением</h3>'+
    '<p><b>'+esc(draft.entry.group)+' · '+esc(draft.entry.name)+'</b> · '+draft.entry.fractions+' фракций</p>'+
    '<div class="catalog-review-zones">'+draft.entry.zones.map(z=>'<p>'+esc(z.label)+' · РОД '+show(z.rod)+' Гр · СОД '+show(z.sod)+' Гр</p>').join('')+'</div>'+
    (draft.entry.group==='C50'?'<p>При бусте: РОД '+show(draft.entry.boostRod)+' Гр · СОД '+show(draft.entry.boostSod)+' Гр</p>':'')+
    (discrepancies.length?'<p class="catalog-warning"><b>Проверь различия между РОД × фракции и СОД:</b> '+esc(discrepancies.join('; '))+'</p>':'')+
    '<p class="safety-note">Справочник — шаблон для демонстрационного расписания. Он не подтверждает лечебную дозу.</p>'+
    '<div class="catalog-form-actions"><button type="button" id="catalog-confirm" class="primary">Сохранить CTV</button><button type="button" id="catalog-preview-cancel">Изменить</button></div>';
   el('catalog-confirm').onclick=()=>{
    if(!pending)return;
    const entry=pending.entry,newState=pending.state;
    pending=null;editing=null;
    // Return to the exact ICD group and show the saved template in the single details panel.
    openedGroup=entry.group;selectedId=entry.id;
    search='';searchClosedGroups.clear();el('ctv-catalog-search').value='';
    commitState(newState);renderApp();notice('CTV сохранён: '+entry.name);
   };
   el('catalog-preview-cancel').onclick=()=>{pending=null;prev.classList.add('hidden');};
   prev.scrollIntoView({block:'nearest',behavior:'smooth'});
  };
  pane.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function confirmChange(draft,message){
  if(draft.error){notice(draft.error);return;}
  if(!confirm(message))return;
  pending=null;editing=null;commitState(draft.state);renderApp();notice('Справочник CTV обновлён');
 }
 function setup(){
  el('ctv-catalog-add').onclick=()=>viewEditor();
  el('ctv-catalog-search').oninput=e=>{search=e.target.value;searchClosedGroups.clear();filterList();};
  el('ctv-catalog-hidden').onchange=e=>{showHidden=e.target.checked;render();};
  el('ctv-catalog-list').onclick=e=>{
   const group=e.target.closest('[data-catalog-group]');
   if(group){
    const code=group.dataset.catalogGroup;
    if(search.trim()){
     if(searchClosedGroups.has(code))searchClosedGroups.delete(code);
     else searchClosedGroups.add(code);
    }else{
     openedGroup=openedGroup===code?null:code;
    }
    selectedId=null;
    filterList();
    [...el('ctv-catalog-list').querySelectorAll('[data-catalog-group]')]
      .find(b=>b.dataset.catalogGroup===code)?.focus();
    return;
   }
   const entry=e.target.closest('[data-catalog-select]');
   if(entry){
    const id=entry.dataset.catalogSelect;
    selectedId=selectedId===id?null:id;
    filterList();
    [...el('ctv-catalog-list').querySelectorAll('[data-catalog-select]')]
      .find(b=>b.dataset.catalogSelect===id)?.focus();
    return;
   }
   if(e.target.closest('[data-catalog-dismiss]')){
    selectedId=null;filterList();
    return;
   }
   const btn=e.target.closest('button');if(!btn)return;
   const action=['edit','clone','hide','reset'].find(x=>btn.dataset['catalog'+x[0].toUpperCase()+x.slice(1)]!==undefined);
   if(!action)return;
   const id=btn.dataset['catalog'+action[0].toUpperCase()+action.slice(1)];
   const t=catalogTemplateById(getState(),id);if(!t){notice('CTV не найден');return;}
   if(action==='edit')viewEditor(t);
   if(action==='clone')viewEditor(t,{clone:true});
   if(action==='hide'){
    const hidden=(getState().ctvCatalog?.hidden||[]).includes(id);
    confirmChange(setCatalogTemplateHiddenDraft(getState(),id,!hidden),hidden?'Вернуть CTV в список выбора?':'Скрыть CTV из выбора новых курсов? Уже сохранённые курсы не изменятся.');
   }
   if(action==='reset')confirmChange(resetBuiltinTemplateDraft(getState(),id),'Вернуть исходные параметры этого CTV? Старые карточки пациентов не изменятся.');
  };
  render();
 }
 function reset(){search='';showHidden=false;editing=null;pending=null;openedGroup=null;selectedId=null;searchClosedGroups.clear();el('ctv-catalog-search').value='';el('ctv-catalog-hidden').checked=false;}
 return {setup,render,reset};
}
