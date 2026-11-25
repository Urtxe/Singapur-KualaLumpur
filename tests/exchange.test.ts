import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, stampChanges, STORAGE_KEY, serializeBackup, validateState, type StorageLike } from '../src/state';
import { createExchangePackage, mergeExchange, parseExchange, previewExchange, saveImportUndo, serializeExchange, undoLastImport } from '../src/exchange';
import type { Activity, Expense, Note, State } from '../src/types';

const activity:Activity={id:'a1',date:'2026-12-04',title:'Arrival',time:'16:15',duration:60,placeId:'',zone:'Rochor',effort:'bajo',priority:'principal',status:'pending',food:'',tickets:'',rain:'',detail:'',fromHotel:'',fromPrevious:''};
const when=new Date('2026-11-25T12:00:00.000Z');
const base=(deviceId:string)=>createInitialState([activity],[],deviceId);
function storage():StorageLike{
  const values=new Map<string,string>();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}
function commit(before:State,next:State,device:string){return stampChanges(before,next,device,when);}

test('shares validated packages, imports once and keeps separate financial records on the other phone',()=>{
  const phoneA=base('phone-a'),phoneB=base('phone-b');
  const shared=commit(phoneA,{...phoneA,activities:[{...activity,time:'17:00'}],expenses:[{id:'meal',date:'2026-12-05',title:'Cena',amount:25,currency:'SGD',category:'Comida',amountMinor:2500,rate:.68,eurMinor:1700}]},'phone-a');
  const pkg=parseExchange(serializeExchange(shared,{kind:'planning'},when));
  assert.equal(pkg.records.some(item=>item.key.startsWith('expense:')),false);
  const result=mergeExchange(phoneB,pkg,{}, {now:when});
  assert.equal(result.state.activities[0].time,'17:00');
  assert.equal(result.state.expenses.length,0);
  assert.equal(result.applied,1);
  assert.deepEqual(previewExchange(result.state,pkg).conflicts,[]);
  assert.equal(mergeExchange(result.state,pkg,{}, {now:when}).applied,0);
});

test('merges expenses across phones and avoids shipping local receipt identifiers',()=>{
  const phoneA=base('phone-a'),phoneB=base('phone-b');
  const local=commit(phoneB,{...phoneB,expenses:[{id:'local-meal',date:'2026-12-05',title:'Cena local',amount:10,currency:'EUR',category:'Comida',receiptId:'private-receipt'}]},'phone-b');
  const remote=commit(phoneA,{...phoneA,expenses:[{id:'remote-meal',date:'2026-12-05',title:'Satay',amount:12,currency:'SGD',category:'Comida',receiptId:'receipt-on-A'}]},'phone-a');
  const pkg=parseExchange(serializeExchange(remote,{kind:'expenses'},when));
  const remoteMeal=pkg.records.find(item=>item.key==='expense:remote-meal');
  assert.ok(remoteMeal&&remoteMeal.value&&typeof remoteMeal.value==='object'&&!('receiptId' in remoteMeal.value));
  const merged=mergeExchange(local,pkg,{}, {now:when});
  assert.deepEqual(merged.state.expenses.map(item=>item.id).sort(),['local-meal','remote-meal']);
  assert.equal(merged.state.expenses.find(item=>item.id==='local-meal')?.receiptId,'private-receipt');
});

test('detects sibling edits, requires an explicit choice, then records a causal resolution',()=>{
  const initial=base('source'),phoneA=base('phone-a'),phoneB=base('phone-b');
  const local=commit(phoneA,{...phoneA,activities:[{...activity,time:'17:00'}]},'phone-a');
  const remote=commit(phoneB,{...phoneB,activities:[{...activity,time:'18:00'}]},'phone-b');
  const pkg=parseExchange(serializeExchange(remote,{kind:'planning'},when));
  assert.equal(previewExchange(local,pkg).conflicts.length,1);
  assert.throws(()=>mergeExchange(local,pkg,{}, {now:when}),/Choose a version/);
  const key='activity:a1',keepLocal=mergeExchange(local,pkg,{[key]:'local'}, {now:when});
  assert.equal(keepLocal.state.activities[0].time,'17:00');
  assert.ok(keepLocal.state.meta.records[key].parents.includes(remote.meta.records[key].revision));
  assert.equal(previewExchange(keepLocal.state,pkg).conflicts.length,0);
  const chooseIncoming=mergeExchange(local,pkg,{[key]:'incoming'}, {now:when});
  assert.equal(chooseIncoming.state.activities[0].time,'18:00');
  assert.equal(initial.activities[0].time,'16:15');
});

test('propagates tombstones without resuscitating an activity from an older package',()=>{
  const initial=base('source'),oldPackage=parseExchange(serializeExchange(initial,{kind:'planning'},when));
  const deleted=commit(initial,{...initial,activities:[]},'source');
  const deletePackage=parseExchange(serializeExchange(deleted,{kind:'planning'},when));
  const receiving=mergeExchange(base('receiver'),deletePackage,{}, {now:when}).state;
  assert.equal(receiving.activities.length,0);
  assert.equal(receiving.trash[0].id,'a1');
  assert.equal(receiving.meta.records['activity:a1'].deleted,true);
  const oldImport=mergeExchange(receiving,oldPackage,{}, {now:when});
  assert.equal(oldImport.state.activities.length,0);
  assert.equal(oldImport.applied,0);
});

test('day packages include matching activity tombstones so deletion propagates selectively',()=>{
  const initial=base('source'),deleted=commit(initial,{...initial,activities:[],trash:[{...activity}]},'source');
  const pkg=parseExchange(serializeExchange(deleted,{kind:'day',date:'2026-12-04'},when));
  assert.ok(pkg.records.some(item=>item.key==='activity:a1'&&item.revision.deleted));
  const receiver=mergeExchange(base('receiver'),pkg,{}, {now:when});
  assert.equal(receiver.state.activities.length,0);
});

test('day packages pair a restored activity with its trash tombstone',()=>{
  const initial=base('source'),deleted=commit(initial,{...initial,activities:[],trash:[activity]},'source');
  const restored=commit(deleted,{...deleted,activities:[activity],trash:[]},'source');
  const pkg=parseExchange(serializeExchange(restored,{kind:'day',date:activity.date},when));
  assert.ok(pkg.records.some(item=>item.key==='activity:a1'&&!item.revision.deleted));
  assert.ok(pkg.records.some(item=>item.key==='trash:a1'&&item.revision.deleted));
  const received=mergeExchange(deleted,pkg,{}, {now:when}).state;
  assert.equal(received.activities.some(item=>item.id==='a1'),true);
  assert.equal(received.trash.some(item=>item.id==='a1'),false);
});

test('import undo restores imported changes but preserves later local edits',()=>{
  const phoneA=base('phone-a'),phoneB=base('phone-b');
  const note={id:'note-a',date:'2026-12-05',placeId:'',text:'Recuerdo compartido',rating:null,memory:''};
  const remote=commit(phoneA,{...phoneA,notes:[note]},'phone-a');
  const pkg=parseExchange(serializeExchange(remote,{kind:'notes'},when));
  const result=mergeExchange(phoneB,pkg,{}, {now:when});
  const storageLike=storage();
  assert.equal(saveImportUndo(phoneB,result.state,result.affectedKeys,storageLike,when,'/asia-trip/'),true);
  const later=commit(result.state,{...result.state,activities:[{...activity,status:'done'}]},'phone-b');
  const undone=undoLastImport(later,storageLike,{path:'/asia-trip/',now:when});
  assert.equal(undone.restored,1);
  assert.equal(undone.skipped,0);
  assert.equal(undone.state.notes.length,0);
  assert.equal(undone.state.activities[0].status,'done');
  assert.throws(()=>undoLastImport(undone.state,storageLike,{path:'/asia-trip/'}),/importación/);
});

test('undo leaves the imported item intact when it was edited after import',()=>{
  const phoneA=base('phone-a'),phoneB=base('phone-b');
  const remote=commit(phoneA,{...phoneA,activities:[{...activity,time:'17:00'}]},'phone-a');
  const pkg=parseExchange(serializeExchange(remote,{kind:'planning'},when)),result=mergeExchange(phoneB,pkg,{}, {now:when});
  const store=storage();saveImportUndo(phoneB,result.state,result.affectedKeys,store,when,'/');
  const later=commit(result.state,{...result.state,activities:[{...result.state.activities[0],time:'18:00'}]},'phone-b');
  const undone=undoLastImport(later,store,{path:'/'});
  assert.equal(undone.restored,0);
  assert.equal(undone.skipped,1);
  assert.equal(undone.state.activities[0].time,'18:00');
});

test('full backups preserve local attachment references; share packages omit them and accept pre-trip records',()=>{
  const initial=base('phone-a'),privateState=stampChanges(initial,{...initial,expenses:[{id:'meal',date:'2025-01-01',title:'Comida',amount:10,currency:'EUR',category:'Comida',receiptId:'receipt-local'} as Expense],notes:[{id:'memory',date:'2025-01-01',placeId:'',text:'Nota',rating:null,memory:'',photoId:'photo-local'} as Note]},'phone-a',when);
  const share=parseExchange(serializeExchange(privateState,{kind:'all'},when));
  assert.equal((share.records.find(item=>item.key==='expense:meal')?.value as Expense).receiptId,undefined);
  assert.equal((share.records.find(item=>item.key==='note:memory')?.value as Note).photoId,undefined);
  const backup=validateState(JSON.parse(serializeBackup(privateState)));
  assert.equal(backup.expenses[0].receiptId,'receipt-local');
  assert.equal(backup.notes[0].photoId,'photo-local');
  assert.equal(backup.expenses[0].date,'2025-01-01');
});

test('full restore creates revisions after remote tombstones and undo restores omitted local records',()=>{
  const withNote=stampChanges(base('phone-a'),{...base('phone-a'),notes:[{id:'local-note',date:'2026-12-05',placeId:'',text:'Keep',rating:null,memory:''}]},'phone-a',when);
  const emptyBackup=base('phone-b');
  const restored=stampChanges(withNote,emptyBackup,'phone-a',when);
  assert.equal(restored.meta.records['note:local-note'].deleted,true);
  const store=storage();
  assert.equal(saveImportUndo(withNote,restored,['note:local-note'],store,when,'/'),true);
  const undone=undoLastImport(restored,store,{path:'/',now:when});
  assert.equal(undone.state.notes[0].id,'local-note');
  assert.equal(undone.restored,1);
});

test('validates that package record keys match their value IDs and permits long-lived revision counters',()=>{
  const initial=base('source'),pkg=createExchangePackage(initial,{kind:'planning'},when);
  const record=pkg.records.find(item=>item.key==='activity:a1')!;
  const mismatched={...pkg,records:[{...record,value:{...activity,id:'different'}}]};
  assert.throws(()=>parseExchange(JSON.stringify(mismatched)));
  const state=stampChanges(initial,{...initial,activities:[{...activity,time:'17:00'}]},'source',when);
  const highCounter={...state,meta:{...state.meta,records:{...state.meta.records,'activity:a1':{...state.meta.records['activity:a1'],version:500}}}};
  assert.equal(validateState(highCounter).meta.records['activity:a1'].version,500);
});

test('rejects malformed packages, duplicate records, forbidden selections, and unvalidated payloads',()=>{
  const initial=base('source'),pkg=createExchangePackage(initial,{kind:'planning'},when);
  assert.throws(()=>parseExchange('{broken'));
  assert.throws(()=>parseExchange(JSON.stringify({...pkg,records:[...pkg.records,...pkg.records]})));
  const wrongSelection={...pkg,records:[{...pkg.records[0],key:'expense:fake',value:{id:'fake',date:'2026-12-04',title:'x',amount:1,currency:'EUR',category:'x',amountMinor:100}}]};
  assert.throws(()=>parseExchange(JSON.stringify(wrongSelection)));
  assert.throws(()=>parseExchange(JSON.stringify({...pkg,records:[{...pkg.records[0],value:{...activity,time:'99:99'}}]})));
  assert.equal(STORAGE_KEY,'asia-trip-state-v1');
});
