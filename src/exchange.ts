import { applyEntity, createInitialState, entities, MAX_BACKUP_BYTES, newRevision, parseBackup, recordKeyFor, validateState } from './state';
import type { RecordKind, StorageLike } from './state';
import type { Activity, RecordRevision, State } from './types';

export type ExchangeSelection =
  | { kind:'all' }
  | { kind:'planning' }
  | { kind:'expenses' }
  | { kind:'day'; date:string }
  | { kind:'notes' }
  | { kind:'favorites' }
  | { kind:'completed' };

export type ExchangeRecord = { key:string; revision:RecordRevision; value?:unknown };
export type ExchangePackage = { format:'asia-trip-exchange'; version:2; deviceId:string; exportedAt:string; selection:ExchangeSelection; records:ExchangeRecord[] };
export type MergeConflict = { key:string; kind:RecordKind; id:string; local:unknown|null; incoming:unknown|null; localRevision:RecordRevision; incomingRevision:RecordRevision };
export type MergePreview = { incoming:number; unchanged:number; automatic:number; conflicts:MergeConflict[]; ignored:number };
export type MergeChoice = 'local'|'incoming';
export type MergeChoices = Record<string,MergeChoice>;
export type MergeResult = { state:State; preview:MergePreview; applied:number; resolved:number; affectedKeys:string[] };

const SAFE_PACKAGE_ID=/^[\w.:@-]{1,220}$/;
const MAX_PACKAGE_RECORDS=5000;
const MAX_REVISION_ANCESTORS=256;
const LEGACY_SNAPSHOT={kind:'all'} as const;
const BASE_COLLECTIONS=new Set(['activity','place','note','expense','favorite','check','cash','budget','trash','dish','dayPreference','settings']);

function fail(message:string):never { throw new Error(`Invalid exchange file: ${message}`); }
function object(value:unknown):value is Record<string,unknown> { return value!==null&&typeof value==='object'&&!Array.isArray(value); }
function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(!object(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function validIso(value:unknown):value is string {
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
}

function parseRevision(value:unknown):RecordRevision {
  if(!object(value)||typeof value.revision!=='string'||value.revision.length<1||value.revision.length>200||!Array.isArray(value.parents)||value.parents.length>MAX_REVISION_ANCESTORS||value.parents.some(parent=>typeof parent!=='string'||parent.length<1||parent.length>200)||new Set(value.parents).size!==value.parents.length||value.parents.includes(value.revision)||!validIso(value.createdAt)||!validIso(value.updatedAt)||typeof value.source!=='string'||!SAFE_PACKAGE_ID.test(value.source)||!Number.isSafeInteger(value.version)||typeof value.version!=='number'||value.version<0||typeof value.deleted!=='boolean') fail('revision metadata is invalid');
  return {revision:value.revision,parents:[...value.parents],createdAt:value.createdAt,updatedAt:value.updatedAt,source:value.source,version:value.version,deleted:value.deleted};
}

function keyParts(key:string):{kind:RecordKind;id:string} {
  const split=key.indexOf(':');
  if(split<1) fail('record key is invalid');
  const kind=key.slice(0,split), recordId=key.slice(split+1);
  if(!BASE_COLLECTIONS.has(kind)||!recordId||recordId.length>100||!SAFE_PACKAGE_ID.test(recordId)) fail('record key is invalid');
  return {kind:kind as RecordKind,id:recordId};
}

function selectionAllows(selection:ExchangeSelection,key:string,value:unknown,tombstoneDate?:string):boolean {
  const {kind,id}=keyParts(key);
  if(selection.kind==='all') return true;
  if(selection.kind==='planning') return kind==='activity'||kind==='place'||kind==='trash'||kind==='dayPreference';
  if(selection.kind==='expenses') return kind==='expense'||kind==='cash'||kind==='budget'||key==='settings:budget'||key==='settings:rates';
  if(selection.kind==='notes') return kind==='note'||kind==='place'&&object(value);
  if(selection.kind==='favorites') return kind==='favorite'||kind==='dish'||kind==='place'&&object(value);
  if(selection.kind==='completed') return kind==='activity'&&object(value)&&value.status==='done'||kind==='place'&&object(value);
  if(selection.kind==='day') return kind==='activity'&&(object(value)?value.date===selection.date:tombstoneDate===selection.date) || kind==='trash'&&(object(value)?value.date===selection.date:tombstoneDate===selection.date) || kind==='dayPreference'&&id===selection.date || kind==='place'&&object(value);
  return false;
}

function validateSelection(value:unknown):ExchangeSelection {
  if(!object(value)||typeof value.kind!=='string') fail('selection is invalid');
  if(value.kind==='all'||value.kind==='planning'||value.kind==='expenses'||value.kind==='notes'||value.kind==='favorites'||value.kind==='completed') return {kind:value.kind};
  if(value.kind==='day'&&typeof value.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&value.date>='2025-01-01'&&value.date<='2035-12-31') return {kind:'day',date:value.date};
  return fail('selection is invalid');
}

function recordsForSelection(state:State,selection:ExchangeSelection):ExchangeRecord[] {
  const all=entities(state), selected:ExchangeRecord[]=[];
  for(const [key,item] of all) {
    const value=item.value;
    if(!selectionAllows(selection,key,value)) continue;
    const revision=state.meta.records[key];
    if(!revision) continue;
    let safeValue=value;
    if(key.startsWith('expense:')&&object(value)) { const expense={...value}; delete expense.receiptId; safeValue=expense; }
    if(key.startsWith('note:')&&object(value)) { const note={...value}; delete note.photoId; safeValue=note; }
    selected.push({key,revision,...(revision.deleted?{}:{value:safeValue})});
  }
  for(const [key,revision] of Object.entries(state.meta.records)) {
    if(!revision.deleted) continue;
    const kind=key.slice(0,key.indexOf(':')),recordId=key.slice(key.indexOf(':')+1);
    const removedActivity=kind==='activity'?state.trash.find(item=>item.id===recordId):kind==='trash'?state.activities.find(item=>item.id===recordId):undefined;
    if(!selectionAllows(selection,key,null,removedActivity?.date)) continue;
    selected.push({key,revision});
  }
  if(selection.kind==='notes'||selection.kind==='favorites'||selection.kind==='completed'||selection.kind==='day') {
    const referenced=new Set<string>();
    for(const item of selected) {
      if(item.key.startsWith('note:')&&object(item.value)&&typeof item.value.placeId==='string'&&item.value.placeId) referenced.add(item.value.placeId);
      if(item.key.startsWith('favorite:')) referenced.add(item.key.slice('favorite:'.length));
      if((item.key.startsWith('activity:')||item.key.startsWith('trash:'))&&object(item.value)&&typeof item.value.placeId==='string'&&item.value.placeId) referenced.add(item.value.placeId);
    }
    for(const item of state.customPlaces) if(referenced.has(item.id)) {
      const key=recordKeyFor('place',item.id);
      if(!selected.some(record=>record.key===key)) selected.push({key,revision:state.meta.records[key],value:item});
    }
  }
  return selected.sort((a,b)=>a.key.localeCompare(b.key));
}

export function createExchangePackage(state:State,selection:ExchangeSelection={kind:'all'},now=new Date()):ExchangePackage {
  const normalized=validateState(state);
  const validSelection=validateSelection(selection);
  if(validSelection.kind==='day'&&!validSelection.date) fail('day selection requires a date');
  const records=recordsForSelection(normalized,validSelection);
  const result={format:'asia-trip-exchange' as const,version:2 as const,deviceId:normalized.meta.deviceId,exportedAt:now.toISOString(),selection:validSelection,records};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_BACKUP_BYTES) fail('exchange file is too large');
  return result;
}

export function serializeExchange(state:State,selection:ExchangeSelection={kind:'all'},now=new Date()):string {
  return JSON.stringify(createExchangePackage(state,selection,now),null,2);
}

function v2StateToPackage(state:State,selection:ExchangeSelection={kind:'all'}):ExchangePackage {
  return createExchangePackage(state,selection);
}

function parseCurrentPackage(value:unknown,knownPlaceIds?:string[]):ExchangePackage {
  if(!object(value)||value.format!=='asia-trip-exchange'||value.version!==2||typeof value.deviceId!=='string'||!SAFE_PACKAGE_ID.test(value.deviceId)||!validIso(value.exportedAt)||!Array.isArray(value.records)||value.records.length>MAX_PACKAGE_RECORDS) fail('package header is invalid');
  const selection=validateSelection(value.selection);
  const seen=new Set<string>();
  const records:ExchangeRecord[]=[];
  let materialized=createInitialState([],[],value.deviceId);
  materialized={...materialized,meta:{...materialized.meta,deviceId:value.deviceId}};
  for(const entry of value.records) {
    if(!object(entry)||typeof entry.key!=='string'||entry.key.length>220||seen.has(entry.key)) fail('package contains an invalid or repeated record');
    seen.add(entry.key);
    const revision=parseRevision(entry.revision),{kind}=keyParts(entry.key);
    if(kind==='settings'&&revision.deleted) fail('settings records cannot be deleted');
    if(!revision.deleted&&!selectionAllows(selection,entry.key,entry.value)) fail('package contains a record outside its selection');
    if(revision.deleted) { if(Object.hasOwn(entry,'value')) fail('deleted records cannot contain live values'); }
    else {
      if(!Object.hasOwn(entry,'value')) fail('live record value is missing');
      materialized=applyEntity(materialized,entry.key,entry.value,false);
    }
    materialized.meta.records[entry.key]=revision;
    records.push({key:entry.key,revision,...(revision.deleted?{}:{value:entry.value})});
  }
  for(const entry of records) if(entry.revision.deleted) {
    const suffix=entry.key.slice(entry.key.indexOf(':')+1),related=records.find(item=>item.key===`${entry.key.startsWith('activity:')?'trash':'activity'}:${suffix}`);
    const deletedDate=object(related?.value)?related.value.date as string|undefined:undefined;
    if(!selectionAllows(selection,entry.key,null,deletedDate)) fail('package contains a record outside its selection');
  }
  for(const [key,revision] of Object.entries(materialized.meta.records)) {
    if(revision.deleted) materialized=applyEntity(materialized,key,undefined,true);
  }
  try { materialized=validateState(materialized,knownPlaceIds); } catch(error) { return fail(error instanceof Error?error.message:'package records are invalid'); }
  return {format:'asia-trip-exchange',version:2,deviceId:value.deviceId,exportedAt:value.exportedAt,selection,records};
}

export function parseExchange(text:string,knownPlaceIds?:string[]):ExchangePackage {
  if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES) fail('exchange file is too large');
  let raw:unknown;
  try { raw=JSON.parse(text); } catch { return fail('file is not valid JSON'); }
  if(object(raw)&&raw.format==='asia-trip-exchange') return parseCurrentPackage(raw,knownPlaceIds);
  let state:State;
  try { state=parseBackup(text,knownPlaceIds); } catch(error) { return fail(error instanceof Error?error.message:'backup is invalid'); }
  return v2StateToPackage(state,LEGACY_SNAPSHOT);
}

function isAncestor(revision:RecordRevision,other:RecordRevision):boolean { return other.parents.includes(revision.revision); }
function syncValue(record:ExchangeRecord):unknown {
  if(!object(record.value))return record.value;
  const value={...record.value};
  if(record.key.startsWith('expense:'))delete value.receiptId;
  if(record.key.startsWith('note:'))delete value.photoId;
  return value;
}
function equivalent(left:ExchangeRecord,right:ExchangeRecord):boolean { return left.revision.deleted===right.revision.deleted&&canonical(syncValue(left))===canonical(syncValue(right)); }
function localRecord(state:State,key:string):ExchangeRecord|undefined {
  const revision=state.meta.records[key];
  if(!revision) return undefined;
  const entity=entities(state).get(key);
  return {key,revision,...(!revision.deleted&&entity?{value:entity.value}:{})};
}

function relation(local:ExchangeRecord|undefined,incoming:ExchangeRecord):'new'|'same'|'local'|'incoming'|'conflict' {
  if(!local) return 'new';
  if(local.revision.revision===incoming.revision.revision||equivalent(local,incoming)) return 'same';
  if(isAncestor(local.revision,incoming.revision)) return 'incoming';
  if(isAncestor(incoming.revision,local.revision)) return 'local';
  return 'conflict';
}

export function previewExchange(local:State,pkg:ExchangePackage):MergePreview {
  const conflicts:MergeConflict[]=[];let unchanged=0,automatic=0,ignored=0;
  for(const incoming of pkg.records) {
    const current=localRecord(local,incoming.key),state=relation(current,incoming);
    if(state==='same'||state==='local') unchanged++;
    else if(state==='conflict') {
      if(current) { const {kind,id}=keyParts(incoming.key); conflicts.push({key:incoming.key,kind,id,local:current.revision.deleted?null:current.value,incoming:incoming.revision.deleted?null:incoming.value,localRevision:current.revision,incomingRevision:incoming.revision}); }
      else ignored++;
    } else automatic++;
  }
  return {incoming:pkg.records.length,unchanged,automatic,conflicts,ignored};
}

function mergedRevision(local:RecordRevision,incoming:RecordRevision,source:string,deleted:boolean,now:Date):RecordRevision {
  const parents=[...new Set([local.revision,incoming.revision,...local.parents,...incoming.parents])].filter(revision=>revision.length<=200).slice(0,MAX_REVISION_ANCESTORS);
  if(Math.max(local.version,incoming.version)>=Number.MAX_SAFE_INTEGER) fail('record version limit reached');
  return {revision:`merge:${source}:${cryptoRandom()}`,parents,createdAt:local.createdAt<incoming.createdAt?local.createdAt:incoming.createdAt,updatedAt:now.toISOString(),source,version:Math.max(local.version,incoming.version)+1,deleted};
}

function cryptoRandom():string { return globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,14)}`; }

function mergeResolvedValue(state:State,key:string,current:ExchangeRecord,incoming:ExchangeRecord,choice:MergeChoice,deviceId:string,now:Date):State {
  const chosen=choice==='incoming'?incoming:current;
  let chosenValue=chosen.value;
  const localValue=localRecord(state,key)?.value;
  if(choice==='incoming'&&object(chosen.value)&&object(localValue)) {
    const merged={...chosen.value};
    if(key.startsWith('expense:')&&localValue.receiptId!==undefined&&merged.receiptId===undefined) merged.receiptId=localValue.receiptId;
    if(key.startsWith('note:')&&localValue.photoId!==undefined&&merged.photoId===undefined) merged.photoId=localValue.photoId;
    chosenValue=merged;
  }
  let next=applyEntity(state,key,chosenValue,chosen.revision.deleted);
  if(key.startsWith('activity:')&&chosen.revision.deleted&&!state.trash.some(item=>item.id===key.slice('activity:'.length))) {
    const oldActivity=state.activities.find(item=>item.id===key.slice('activity:'.length));
    if(oldActivity) {
      const trashKey=recordKeyFor('trash',oldActivity.id);
      next={...next,trash:[...next.trash,oldActivity],meta:{...next.meta,records:{...next.meta.records,[trashKey]:newRevision(deviceId,next.meta.records[trashKey],false,now)}}};
    }
  }
  const rev=mergedRevision(current.revision,incoming.revision,deviceId,chosen.revision.deleted,now);
  next.meta={...next.meta,records:{...next.meta.records,[key]:rev}};
  return next;
}

export function mergeExchange(local:State,pkg:ExchangePackage,choices:MergeChoices={},options:{knownPlaceIds?:string[];now?:Date}={}):MergeResult {
  const localState=validateState(local,options.knownPlaceIds),preview=previewExchange(localState,pkg);
  const unresolved=preview.conflicts.filter(conflict=>!choices[conflict.key]);
  if(unresolved.length) throw new Error(`Choose a version for ${unresolved.map(item=>item.id).join(', ')}`);
  let next=localState,applied=0,resolved=0;
  const now=options.now??new Date();
  for(const incoming of pkg.records) {
    const current=localRecord(next,incoming.key),state=relation(current,incoming);
    if(state==='same'||state==='local') continue;
    if(state==='conflict') {
      if(!current) continue;
      next=mergeResolvedValue(next,incoming.key,current,incoming,choices[incoming.key],localState.meta.deviceId,now);applied++;resolved++;continue;
    }
    if(incoming.revision.deleted&&incoming.key.startsWith('activity:')) {
      const oldActivity=next.activities.find(item=>recordKeyFor('activity',item.id)===incoming.key);
      if(oldActivity&&!next.trash.some(item=>item.id===oldActivity.id)) {
        const trashKey=recordKeyFor('trash',oldActivity.id);
        next={...next,trash:[...next.trash,oldActivity],meta:{...next.meta,records:{...next.meta.records,[trashKey]:newRevision(localState.meta.deviceId,next.meta.records[trashKey],false,now)}}};
      }
    }
    const existingValue=current?.value;
    let incomingValue=incoming.value;
    if(!incoming.revision.deleted&&object(incoming.value)&&object(existingValue)) {
      const merged={...incoming.value};
      if(incoming.key.startsWith('expense:')&&existingValue.receiptId!==undefined&&merged.receiptId===undefined) merged.receiptId=existingValue.receiptId;
      if(incoming.key.startsWith('note:')&&existingValue.photoId!==undefined&&merged.photoId===undefined) merged.photoId=existingValue.photoId;
      incomingValue=merged;
    }
    next=applyEntity(next,incoming.key,incomingValue,incoming.revision.deleted);
    next.meta={...next.meta,records:{...next.meta.records,[incoming.key]:incoming.revision}};applied++;
  }
  next={...next,meta:{...next.meta,deviceId:localState.meta.deviceId}};
  next=validateState(next,options.knownPlaceIds);
  const affectedKeys=[...new Set([...Object.keys(localState.meta.records),...Object.keys(next.meta.records)])].filter(key=>localState.meta.records[key]?.revision!==next.meta.records[key]?.revision);
  return {state:next,preview,applied,resolved,affectedKeys};
}

export type UndoEnvelope={format:'asia-trip-import-undo';version:1;importedAt:string;before:State;after:Record<string,string>};
export const undoStorageKey=(path=typeof location==='undefined'?'/':location.pathname)=>`${'asia-trip-state-v1'}:import-undo:${path}`;

export function saveImportUndo(before:State,after:State,keys:string[],storage:StorageLike,now=new Date(),path?:string):boolean {
  try {
    const revisions:Record<string,string>={};
    for(const key of keys) revisions[key]=after.meta.records[key]?.revision??'';
    const envelope:UndoEnvelope={format:'asia-trip-import-undo',version:1,importedAt:now.toISOString(),before,after:revisions};
    const text=JSON.stringify(envelope);
    if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES) return false;
    storage.setItem(undoStorageKey(path),text);return true;
  } catch { return false; }
}

export function undoLastImport(current:State,storage:StorageLike,options:{knownPlaceIds?:string[];path?:string;now?:Date}={}):{state:State;restored:number;skipped:number} {
  let envelope:UndoEnvelope;
  try {
    const raw=storage.getItem(undoStorageKey(options.path));
    if(!raw||new TextEncoder().encode(raw).byteLength>MAX_BACKUP_BYTES) fail('no import to undo');
    const value=JSON.parse(raw) as unknown;
    if(!object(value)||value.format!=='asia-trip-import-undo'||value.version!==1||!object(value.before)||!object(value.after)) fail('undo record is invalid');
    envelope=value as unknown as UndoEnvelope;
    envelope.before=validateState(envelope.before,options.knownPlaceIds);
  } catch { throw new Error('No se encontró una importación reciente que pueda deshacerse.'); }
  let next=validateState(current,options.knownPlaceIds),restored=0,skipped=0;
  const beforeEntities=entities(envelope.before),now=options.now??new Date();
  for(const [key,expectedRevision] of Object.entries(envelope.after)) {
    const actual=next.meta.records[key]?.revision??'';
    if(actual!==expectedRevision) { skipped++;continue; }
    const before=beforeEntities.get(key),currentRecord=localRecord(next,key),previousRevision=envelope.before.meta.records[key],currentRevision=next.meta.records[key];
    if(before) next=applyEntity(next,key,before.value,false);
    else next=applyEntity(next,key,undefined,true);
    const restoredRevision=newRevision(next.meta.deviceId,currentRevision??currentRecord?.revision,!before,now);
    if(previousRevision) restoredRevision.parents=[...new Set([...restoredRevision.parents,previousRevision.revision,...previousRevision.parents])].slice(0,MAX_REVISION_ANCESTORS);
    next.meta={...next.meta,records:{...next.meta.records,[key]:restoredRevision}};
    if(currentRecord?.revision.deleted===false&&before===undefined&&key.startsWith('activity:')) {
      const old=currentRecord.value as Activity,trashKey=recordKeyFor('trash',old.id);
      if(!next.meta.records[trashKey]) next={...next,trash:[...next.trash,old],meta:{...next.meta,records:{...next.meta.records,[trashKey]:newRevision(next.meta.deviceId,undefined,false,now)}}};
    }
    restored++;
  }
  next=validateState(next,options.knownPlaceIds);
  if(restored>0) try { storage.removeItem?.(undoStorageKey(options.path)); } catch { /* the undo remains available if storage removal fails */ }
  return {state:next,restored,skipped};
}
