import { createExchangePackage, mergeExchange, parseExchange, previewExchange, saveImportUndo, undoLastImport, type ExchangePackage, type ExchangeSelection, type MergeChoices } from './exchange';
import { entities, MAX_BACKUP_BYTES, parseBackup, serializeBackup, stampChanges, STORAGE_KEY, type StorageLike } from './state';
import type { AppContext } from './app-api';
import type { State } from './types';
import { e, icon } from './ui';

type Screen={pkg:ExchangePackage;choices:MergeChoices;summary:string;fileName:string;selected:Set<string>;backup?:State};
const standardModes:Array<[ExchangeSelection['kind'],string]>=[['planning','Planificación'],['expenses','Gastos'],['all','Viaje completo']];
const advancedModes:Array<[ExchangeSelection['kind'],string]>=[['day','Un día'],['notes','Notas'],['favorites','Favoritos y platos'],['completed','Actividades realizadas']];
const appStorage=(path=location.pathname):StorageLike=>({getItem:key=>localStorage.getItem(`${key}:${path}`),setItem:(key,value)=>localStorage.setItem(`${key}:${path}`,value),removeItem:key=>localStorage.removeItem(`${key}:${path}`)});
const placeIds=(app:AppContext)=>{const custom=new Set(app.getState().customPlaces.map(place=>place.id));return app.places().filter(place=>!custom.has(place.id)).map(place=>place.id);};
const escape=(value:unknown)=>e(String(value??''));
function readableSummary(pkg: ExchangePackage) {
  const visits = pkg.records.flatMap(record => {
    if (!record.key.startsWith('activity:') || record.revision.deleted || typeof record.value !== 'object' || !record.value) return [];
    const { date, time, title, archived } = record.value as { date?:string; time?:string; title?:string; archived?:boolean };
    return !archived && title ? [{ date:date || 'Ideas', time:time || '', title }] : [];
  }).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  let previous = '';
  const lines = visits.flatMap(({ date,time,title }) => {
    const line = `${time || 'Sin hora'} · ${title}`;
    if (date === previous) return [line];
    previous = date;
    return [`\n${date}`,line];
  });
  return [summary(pkg),...lines].join('\n');
}
function download(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
function selectionFrom(root:HTMLElement):ExchangeSelection {
  const kind=root.querySelector<HTMLInputElement>('[name="share-kind"]:checked')?.value as ExchangeSelection['kind']??'planning';
  return kind==='day'?{kind,date:root.querySelector<HTMLInputElement>('[name="share-day"]')?.value??''}:{kind} as ExchangeSelection;
}
function summary(pkg:ExchangePackage){
  const counts=new Map<string,number>();
  for(const item of pkg.records){const kind=item.key.split(':',1)[0];counts.set(kind,(counts.get(kind)??0)+1);}
  const selectionLabel=pkg.selection.kind==='planning'?'Planificación':pkg.selection.kind==='expenses'?'Gastos y efectivo':pkg.selection.kind==='day'?'Un día':pkg.selection.kind==='notes'?'Notas':pkg.selection.kind==='favorites'?'Favoritos y platos':pkg.selection.kind==='completed'?'Actividades realizadas':'Todo el viaje';
  return `Asia Trip 2026 · ${selectionLabel}\n${Array.from(counts.entries()).map(([kind,count])=>`${labels[kind]??kind}: ${count}`).join('\n')}\nExportado ${new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(pkg.exportedAt))}`;
}
function parseIncoming(text:string,knownPlaceIds:string[]):{pkg:ExchangePackage;backup?:State} {
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{throw new Error('El archivo no contiene un JSON válido.');}
  let backup:State|undefined;
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&'version' in raw&&((raw as {version?:unknown}).version===1||(raw as {version?:unknown}).version===2)&&!('format' in raw))backup=parseBackup(text,knownPlaceIds);
  return {pkg:parseExchange(text,knownPlaceIds),backup};
}
function safeSummary(state:State,selection:ExchangeSelection):string {try{return summary(createExchangePackage(state,selection));}catch{return 'La selección supera el límite de tamaño de archivo.';}}
const labels:Record<string,string>={activity:'Actividades',place:'Lugares añadidos',trash:'Papelera',dayPreference:'Preferencias del día',expense:'Gastos',cash:'Efectivo',budget:'Presupuestos',settings:'Ajustes económicos',note:'Notas',favorite:'Favoritos',dish:'Platos probados',check:'Lista'};
function selectedPackage(pending:Screen):ExchangePackage{return {...pending.pkg,records:pending.pkg.records.filter(item=>pending.selected.has(item.key.split(':',1)[0]))};}
function fieldSummary(value:unknown):string {
  if(!value||typeof value!=='object'||Array.isArray(value))return escape(value??'Eliminación');
  const fields=Object.entries(value as Record<string,unknown>).filter(([key])=>!['id','photoId','receiptId'].includes(key)).slice(0,6);
  return fields.map(([key,item])=>`${escape(key)}: ${escape(typeof item==='string'?item.slice(0,100):JSON.stringify(item))}`).join(' · ')||'Sin campos visibles';
}
function renderPending(target:HTMLElement,pending:Screen|null,state:State){
  const panel=target.querySelector<HTMLElement>('#exchange-review');
  if(!panel)return;
  if(!pending){panel.innerHTML='';return;}
  const pkg=selectedPackage(pending),preview=previewExchange(state,pkg),counts=new Map<string,number>();
  for(const item of pending.pkg.records){const kind=item.key.split(':',1)[0];counts.set(kind,(counts.get(kind)??0)+1);}
  panel.innerHTML=`<section class="exchange-review"><div class="eyebrow">REVISIÓN DE IMPORTACIÓN</div><h2>${preview.incoming} elementos seleccionados</h2><p>${preview.automatic} nuevos o posteriores · ${preview.unchanged} ya sincronizados · ${preview.conflicts.length} conflictos</p><fieldset class="exchange-collections"><legend>Datos que quieres combinar</legend>${[...counts].map(([kind,count])=>`<label><input type="checkbox" data-import-kind="${escape(kind)}" ${pending.selected.has(kind)?'checked':''}><span>${escape(labels[kind]??kind)} <small>${count}</small></span></label>`).join('')}</fieldset>${preview.ignored?`<p>${preview.ignored} elementos no se pueden aplicar con la información local disponible.</p>`:''}${preview.conflicts.length?`<div class="exchange-conflicts">${preview.conflicts.map(conflict=>`<fieldset><legend>${escape(labels[conflict.kind]??conflict.kind)} · ${escape(conflict.id)}</legend><div class="exchange-diff"><small>Este teléfono: ${fieldSummary(conflict.local)}</small><small>Archivo: ${fieldSummary(conflict.incoming)}</small></div><label><input type="radio" name="conflict:${escape(conflict.key)}" value="local" checked><span><strong>Conservar este teléfono</strong><small>${escape(revisionLabel(conflict.localRevision))}</small></span></label><label><input type="radio" name="conflict:${escape(conflict.key)}" value="incoming"><span><strong>Usar el archivo recibido</strong><small>${escape(revisionLabel(conflict.incomingRevision))}</small></span></label></fieldset>`).join('')}</div>`:''}<div class="actions"><button type="button" class="button primary" data-exchange-action="apply">Combinar selección</button>${pending.backup?'<button type="button" class="button danger" data-exchange-action="restore-backup">Restaurar copia completa…</button>':''}<button type="button" class="button" data-exchange-action="cancel">Cancelar</button></div></section>`;
}
function revisionLabel(revision:{source:string;updatedAt:string;version:number}){const date=revision.updatedAt==='1970-01-01T00:00:00.000Z'?'dato inicial':new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(revision.updatedAt));return `${date} · versión ${revision.version}`;}

export function mountExchange(target:HTMLElement,app:AppContext){
  let pending:Screen|null=null;
  const render=()=>{
    const selection=selectionFrom(target);
    const dateField=target.querySelector<HTMLElement>('[data-share-day-field]');
    if(dateField)dateField.hidden=selection.kind!=='day';
    const summaryField=target.querySelector<HTMLElement>('.exchange-summary');
    if(summaryField)summaryField.textContent=safeSummary(app.getState(),selection);
    renderPending(target,pending,app.getState());
  };
  const choice=([value,label]:[ExchangeSelection['kind'],string])=>`<label><input type="radio" name="share-kind" value="${value}"${value==='planning'?' checked':''}> ${e(label)}</label>`;
  target.innerHTML=`<section class="exchange-shell"><header class="page-head"><h1>Intercambiar datos</h1><p>Comparte un archivo para combinar cambios entre teléfonos.</p></header>
    <div class="exchange-grid">
      <details class="exchange-card exchange-entry"><summary><span class="more-icon">${icon('compartir')}</span>Enviar mis cambios</summary>
        <fieldset class="exchange-choices"><legend class="sr-only">Qué quieres compartir</legend>${standardModes.map(choice).join('')}</fieldset>
        <div class="actions"><button type="button" class="button primary" data-exchange-action="share">Compartir archivo</button><button type="button" class="button" data-exchange-action="download-json">Descargar paquete JSON</button></div>
        <details class="exchange-advanced"><summary>Más opciones de envío</summary><fieldset class="exchange-choices"><legend class="sr-only">Selección avanzada</legend>${advancedModes.map(choice).join('')}</fieldset><label class="field" data-share-day-field hidden><span>Día</span><input type="date" name="share-day" value="${escape(app.selectedDate())}" min="2025-01-01" max="2035-12-31"></label><p class="exchange-summary"></p><div class="actions"><button type="button" class="button" data-exchange-action="copy-package">Copiar paquete JSON</button><button type="button" class="button" data-exchange-action="copy-summary">Copiar resumen</button></div></details>
      </details>
      <details class="exchange-card exchange-entry" data-exchange-receive><summary><span class="more-icon">${icon('offline')}</span>Recibir cambios</summary>
        <label class="field"><span>Selecciona una copia o paquete recibido</span><input type="file" accept="application/json,.json" data-exchange-file></label>
        <details class="exchange-advanced"><summary>Pegar un paquete JSON</summary><label class="field"><span>Contenido recibido</span><textarea data-exchange-paste rows="4" maxlength="1000000"></textarea></label><button type="button" class="button" data-exchange-action="review-paste">Revisar paquete pegado</button></details>
      </details>
    </div><div id="exchange-review"></div>
    <details class="exchange-card exchange-advanced"><summary>Copias y recuperación</summary><p class="muted">Puedes restaurar una copia anterior o deshacer la última combinación conservando las ediciones posteriores.</p><div class="actions"><button type="button" class="button" data-exchange-action="full-backup">Descargar copia completa</button><button type="button" class="button danger" data-exchange-action="undo">Deshacer última importación</button></div></details>
    </section>`;
  const setPackage=(pkg:ExchangePackage,name='paquete.json',backup?:State)=>{pending={pkg,choices:{},summary:summary(pkg),fileName:name,selected:new Set(pkg.records.map(item=>item.key.split(':',1)[0])),backup};render();};
  const readFile=async(file:File)=>{
    if(file.size>MAX_BACKUP_BYTES){app.notify('El archivo supera el límite de 1 MB.');return;}
    try{const text=await file.text(),parsed=parseIncoming(text,placeIds(app));setPackage(parsed.pkg,file.name,parsed.backup);app.notify('Archivo validado. Revisa qué datos quieres combinar.');}
    catch(error){app.notify(error instanceof Error?error.message:'No se pudo leer el archivo.');}
  };
  target.addEventListener('change',event=>{
    const element=event.target;
    if(element instanceof HTMLInputElement&&element.matches('[data-exchange-file]')&&element.files?.[0])void readFile(element.files[0]).finally(()=>{element.value='';});
    if(element instanceof HTMLInputElement&&element.matches('[data-import-kind]')&&pending){const kind=element.dataset.importKind??'';if(element.checked)pending.selected.add(kind);else pending.selected.delete(kind);render();}
    if(element instanceof HTMLInputElement&&element.name==='share-kind')render();
  });
  target.addEventListener('click',async event=>{
    if(!(event.target instanceof Element))return;
    const button=event.target.closest<HTMLButtonElement>('[data-exchange-action]');
    if(!button)return;
    const action=button.dataset.exchangeAction;
    if(action==='cancel'){pending=null;render();return;}
    if(action==='review-paste'){
      const text=target.querySelector<HTMLTextAreaElement>('[data-exchange-paste]')?.value??'';
      if(!text.trim()){app.notify('Pega el contenido de un paquete JSON.');return;}
      try{const parsed=parseIncoming(text,placeIds(app));setPackage(parsed.pkg,'paquete.json',parsed.backup);app.notify('Paquete validado. Revisa los cambios antes de combinarlos.');}
      catch(error){app.notify(error instanceof Error?error.message:'No se pudo validar el paquete.');}
      return;
    }
    if(action==='share'||action==='download-json'||action==='copy-summary'||action==='copy-package'){
      try{
        const selection=selectionFrom(target);
        if(selection.kind==='day'&&!selection.date){app.notify('Elige un día antes de exportar.');return;}
        const pkg=createExchangePackage(app.getState(),selection);
        const text=JSON.stringify(pkg,null,2),file=new File([text],`asia-trip-${pkg.selection.kind}.json`,{type:'application/json'});
        if(action==='share'&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Asia Trip 2026',text:'Paquete para importar en Asia Trip 2026'});app.notify('Paquete abierto en el menú para compartir.');}
        else if(action==='share'||action==='download-json'){download(file.name,text);app.notify('Archivo descargado. Adjunta este JSON en WhatsApp o correo.');}
        else if(action==='copy-package'){await navigator.clipboard.writeText(text);app.notify('Paquete JSON copiado.');}
        else{await navigator.clipboard.writeText(readableSummary(pkg));app.notify('Resumen copiado.');}
      }catch(error){if(error instanceof Error&&error.name==='AbortError')return;app.notify(error instanceof Error?error.message:'No se pudo preparar el contenido.');}
      return;
    }
    if(action==='full-backup'){
      try{
        const text=serializeBackup(app.getState(),placeIds(app));download('asia-trip-copia-completa.json',text);
        const basePath=new URL(import.meta.env.BASE_URL,location.href).pathname;
        try{localStorage.setItem(`asia-trip-last-backup:${basePath}`,new Date().toISOString());}catch{/* backup file was created even if timestamp storage is unavailable */}
        app.notify('Copia completa descargada. Incluye los datos locales y referencias de recibos y fotos.');
      }catch(error){app.notify(error instanceof Error?error.message:'No se pudo descargar la copia completa.');}
      return;
    }
    if(action==='undo'){
      try{
        const storage=appStorage(),undoKey=`${STORAGE_KEY}:import-undo:${location.pathname}`,oldUndo=storage.getItem(undoKey);
        const result=undoLastImport(app.getState(),storage,{knownPlaceIds:placeIds(app)});
        if(!result.restored){app.notify('No quedan cambios de la última importación para deshacer.');return;}
        if(app.applyImported(result.state,`Importación deshecha. ${result.restored} cambios restaurados${result.skipped?`, ${result.skipped} conservados`:''}.`))render();
        else if(oldUndo!==null)storage.setItem(undoKey,oldUndo);
      }catch(error){app.notify(error instanceof Error?error.message:'No se pudo deshacer la importación.');}
      return;
    }
    if(action==='restore-backup'&&pending?.backup){
      if(!window.confirm('Restaurar esta copia completa sustituirá el contenido actual del viaje. La aplicación guardará antes una copia local y podrás deshacerlo. ¿Continuar?'))return;
      try{const current=app.getState(),next=stampChanges(current,pending.backup,current.meta.deviceId),keys=[...new Set([...entities(current).keys(),...entities(next).keys(),...Object.keys(current.meta.records),...Object.keys(next.meta.records)])].filter(key=>current.meta.records[key]?.revision!==next.meta.records[key]?.revision),storage=appStorage(),undoKey=`${STORAGE_KEY}:import-undo:${location.pathname}`,oldUndo=storage.getItem(undoKey);
        if(!keys.length){app.notify('La copia ya contiene los mismos datos. No se ha cambiado nada.');pending=null;render();return;}
        if(!saveImportUndo(current,next,keys,storage)){app.notify('No hay espacio para guardar la copia local previa. Libera espacio antes de restaurar.');return;}
        if(!app.applyImported(next,'Se restauró una copia completa del viaje.')){if(oldUndo===null)storage.removeItem?.(undoKey);else storage.setItem(undoKey,oldUndo);return;}
        pending=null;render();
      }catch(error){app.notify(error instanceof Error?error.message:'No se pudo restaurar la copia.');}
      return;
    }
    if(action==='apply'&&pending){
      const pkg=selectedPackage(pending),current=app.getState(),preview=previewExchange(current,pkg),choices:MergeChoices={};
      for(const conflict of preview.conflicts){const choice=Array.from(target.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(input=>input.name===`conflict:${conflict.key}`&&input.checked)?.value;if(choice!=='local'&&choice!=='incoming'){app.notify('Elige qué versión conservar en cada conflicto.');return;}choices[conflict.key]=choice;}
      try{
        const result=mergeExchange(current,pkg,choices,{knownPlaceIds:placeIds(app)});
        const keys=result.affectedKeys,storage=appStorage(),undoKey=`${STORAGE_KEY}:import-undo:${location.pathname}`,oldUndo=storage.getItem(undoKey);
        if(!keys.length){app.notify('No hay cambios nuevos que combinar. La copia anterior para deshacer se conserva.');pending=null;render();return;}
        if(!saveImportUndo(current,result.state,keys,storage)){app.notify('No hay espacio para guardar la copia de seguridad automática. Libera espacio antes de importar.');return;}
        if(!app.applyImported(result.state,`Se combinaron ${result.applied} cambios${result.resolved?` y se resolvieron ${result.resolved} conflictos`:''}.`)){
          if(oldUndo===null)storage.removeItem?.(undoKey);else storage.setItem(undoKey,oldUndo);
          return;
        }
        pending=null;render();
      }catch(error){app.notify(error instanceof Error?error.message:'No se pudo combinar el archivo.');}
    }
  });
  render();
}
