import assert from 'node:assert/strict';
import test from 'node:test';
import { asiaDate, convertAmount, createInitialState, escapeHTML, loadState, parseBackup, refreshBaseActivities, saveState, serializeBackup, stampChanges, STORAGE_KEY, toSafeCSVCell, validateState, type StorageLike } from '../src/state';
import type { Activity, Expense, State } from '../src/types';
import { baseActivities } from '../src/data';

const activity:Activity={id:'a1',date:'2026-12-04',title:'Arrival',time:'16:15',duration:60,placeId:'',zone:'Rochor',effort:'bajo',priority:'principal',status:'pending',food:'',tickets:'',rain:'',detail:'',fromHotel:'',fromPrevious:''};
const known=['mi-rochor','changi'];
const state=():State=>createInitialState([activity],['passports'],'device-test');
function memoryStorage():StorageLike {
  const values=new Map<string,string>();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}
function legacy(snapshot:State){
  const expenses=snapshot.expenses.map(expense=>{const old={...expense};for(const key of ['amountMinor','rate','eurMinor','phase','city','method','people','payer','activityId','receiptId','notes','time'])delete old[key as keyof typeof old];return old;});
  return {version:1,activities:snapshot.activities,customPlaces:snapshot.customPlaces,favorites:snapshot.favorites,notes:snapshot.notes,expenses,budget:snapshot.budget,rates:snapshot.rates,checks:snapshot.checks,theme:snapshot.theme,family:snapshot.family};
}

test('creates version 2 defaults and round trips a strict backup',()=>{
  const original=state(),parsed=parseBackup(serializeBackup(original,known),known);
  assert.deepEqual(parsed,original);
  assert.equal(parsed.version,2);
  assert.equal(parsed.theme,'auto');
  assert.equal(parsed.rates.SGD,null);
  assert.equal(parsed.meta.deviceId,'device-test');
  assert.ok(parsed.meta.records['activity:a1']);
});

test('migrates version 1 backup and settings without losing existing records',()=>{
  const original=state();
  const old=legacy({...original,expenses:[{id:'expense-1',date:'2026-12-05',title:'Lunch',amount:20,currency:'SGD',category:'Comida'} as Expense]});
  old.rates.SGD=.68;
  const migrated=parseBackup(JSON.stringify(old));
  assert.equal(migrated.version,2);
  assert.deepEqual(migrated.activities,original.activities);
  assert.equal(migrated.expenses[0].amountMinor,2000);
  assert.equal(migrated.expenses[0].rate,.68);
  assert.equal(migrated.expenses[0].eurMinor,1360);
  assert.equal(migrated.expenses[0].phase,'destination');
  assert.equal(migrated.meta.records['activity:a1'].revision,original.meta.records['activity:a1'].revision);
});

test('migrates a V1 edit as a child of the stable initial revision',()=>{
  const original=createInitialState(baseActivities,[],'device-test'),old=legacy(original);
  old.activities=baseActivities.map(item=>item.id===baseActivities[0].id?{...item,time:'17:00'}:item);
  const migrated=parseBackup(JSON.stringify(old));
  const id=baseActivities[0].id,revision=migrated.meta.records[`activity:${id}`];
  assert.deepEqual(revision.parents,[original.meta.records[`activity:${id}`].revision]);
  assert.equal(migrated.activities.find(item=>item.id===id)?.time,'17:00');
});

test('refreshes untouched itinerary seed rows while preserving personal edits and avoiding deleted rows',()=>{
  const oldSeed=baseActivities.filter(item=>item.id!=='transfer-changi-sg').map(item=>item.id==='jewel-arrival'?{...item,date:'2026-12-04',time:'17:30'}:item.id==='helix-mbs'?{...item,time:'10:15'}:item);
  const original=createInitialState(oldSeed,['passports'],'device-test');
  const customized=stampChanges(original,{...original,activities:original.activities.map(item=>item.id==='jewel-arrival'?{...item,title:'Mi versión de Jewel'}:item)},'device-test',new Date('2026-11-26T00:00:00.000Z'));
  const refreshed=refreshBaseActivities(customized,['jewel-arrival','helix-mbs','transfer-changi-sg']);
  assert.equal(refreshed.activities.find(item=>item.id==='jewel-arrival')?.title,'Mi versión de Jewel');
  assert.equal(refreshed.activities.find(item=>item.id==='jewel-arrival')?.time,'17:30');
  assert.equal(refreshed.activities.find(item=>item.id==='helix-mbs')?.time,'10:45');
  assert.equal(refreshed.activities.find(item=>item.id==='transfer-changi-sg')?.time,'10:00');
  assert.deepEqual(refreshed.checks,['passports']);
  assert.ok(refreshed.meta.records['activity:helix-mbs'].parents.includes(original.meta.records['activity:helix-mbs'].revision));
  const otherDevice=refreshBaseActivities(createInitialState(oldSeed,['passports'],'device-other'),['jewel-arrival','helix-mbs','transfer-changi-sg']);
  assert.equal(otherDevice.meta.records['activity:helix-mbs'].revision,refreshed.meta.records['activity:helix-mbs'].revision);
  assert.equal(validateState(refreshed).activities.find(item=>item.id==='helix-mbs')?.time,'10:45');
  const deleted=stampChanges(original,{...original,activities:original.activities.filter(item=>item.id!=='helix-mbs')},'device-test',new Date('2026-11-26T00:00:00.000Z'));
  assert.ok(!refreshBaseActivities(deleted,['helix-mbs']).activities.some(item=>item.id==='helix-mbs'));
});

test('loads V1 state and persists migrated V2 data under the same key',()=>{
  const storage=memoryStorage();
  storage.setItem(STORAGE_KEY,JSON.stringify(legacy(state())));
  const result=loadState(storage,known);
  assert.equal(result.status,'ok');
  assert.equal(result.migrated,true);
  assert.equal(result.state?.version,2);
  assert.equal(loadState(storage,known).migrated,undefined);
});

test('rejects invalid versions, dates, duplicates, references, metadata, and oversized files',()=>{
  const original=state();
  assert.throws(()=>validateState({...original,version:3}));
  assert.throws(()=>validateState({...original,activities:[{...activity,date:'2026-02-30'}]}));
  assert.throws(()=>validateState({...original,activities:[activity,activity]}));
  assert.throws(()=>validateState({...original,activities:[{...activity,placeId:'unknown'}]},known));
  assert.throws(()=>validateState({...original,meta:{...original.meta,records:{}}}));
  assert.throws(()=>parseBackup(' '.repeat(1_000_001)));
});

test('validates empty activity time and ideas, day preferences, cash movements and budgets',()=>{
  const original=state();
  const idea={...activity,id:'idea-1',date:'',time:'',title:'Idea'};
  const next=stampChanges(original,{...original,activities:[...original.activities,idea],dayPreferences:{'2026-12-04':['rain','quiet']},cash:[{id:'cash-1',date:'2026-12-04',time:'12:00',currency:'SGD',kind:'withdrawal',amountMinor:10000,feeMinor:100,feeEurMinor:68,notes:''}],budgets:[{id:'budget-1',scope:'city',qualifier:'sg',amountMinor:50000}]},'device-test',new Date('2026-11-25T00:00:00.000Z'));
  assert.equal(validateState(next).activities.at(-1)?.date,'');
  assert.equal(validateState(next).cash.length,1);
  assert.equal(validateState(next).budgets.length,1);
  assert.throws(()=>validateState({...next,dayPreferences:{'2026-12-04':['unknown']}}));
});

test('storage reports empty, corrupt, unavailable and saved states safely',()=>{
  const storage=memoryStorage();
  assert.equal(loadState(storage).status,'empty');
  assert.equal(saveState(state(),storage,known),true);
  assert.equal(loadState(storage,known).status,'ok');
  storage.setItem(STORAGE_KEY,'{broken');
  assert.equal(loadState(storage).status,'corrupt');
  assert.equal(loadState({getItem(){throw Error('blocked');},setItem(){}}).status,'unavailable');
  assert.equal(saveState(state(),{getItem(){return null;},setItem(){throw Error('quota');}},known),false);
});

test('escapes HTML, protects CSV formulas, converts money and calculates UTC+8 dates',()=>{
  assert.equal(escapeHTML(`<script a="'">&`),'&lt;script a=&quot;&#39;&quot;&gt;&amp;');
  assert.equal(toSafeCSVCell('=1+1'),`"'=1+1"`);
  assert.equal(toSafeCSVCell('\u0000=1+1'),`"'\u0000=1+1"`);
  assert.equal(toSafeCSVCell('\t-2+3'),`"'\t-2+3"`);
  assert.equal(toSafeCSVCell('safe, "quoted"'),'"safe, ""quoted"""');
  assert.equal(convertAmount(22.99,'EUR',{SGD:null,MYR:null}),22.99);
  assert.equal(convertAmount(100,'SGD',{SGD:1.5,MYR:null}),150);
  assert.equal(convertAmount(100,'MYR',{SGD:null,MYR:null}),null);
  assert.equal(asiaDate(new Date('2026-12-03T16:30:00Z')),'2026-12-04');
});
