'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DEFAULTS,normalizeModel,normalizeSettings,endpoint,fingerprint,jsonObject,int}=require('../src/core/config.cjs');
const {Store}=require('../src/core/store.cjs');
const {previewCron,Scheduler}=require('../src/core/scheduler.cjs');
const {evaluateRanking}=require('../src/core/ranking.cjs');

// 每个测试独立临时目录，避免互相污染
async function tempStore(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'modelpulse-suite-'));
  const s=await Store.open(dir);
  return {s,dir,cleanup(){s.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

test('settings and config: fingerprint changes with relevant parameters',()=>{
  const m={name:'a',modelId:'b',host:'https://example.com/v1',protocol:'chat'};
  const base=normalizeModel(m);
  assert.equal(fingerprint(base,DEFAULTS),fingerprint(base,DEFAULTS));
  // 协议、模型 ID、额外参数、推理强度变化都应改变指纹
  assert.notEqual(fingerprint({...base,modelId:'c'},DEFAULTS),fingerprint(base,DEFAULTS));
  assert.notEqual(fingerprint({...base,protocol:'responses'},DEFAULTS),fingerprint(base,DEFAULTS));
  assert.notEqual(fingerprint({...base,reasoning:'high'},DEFAULTS),fingerprint(base,DEFAULTS));
  // 无关字段（名称、备注）不改变指纹
  assert.equal(fingerprint({...base,name:'X'},DEFAULTS),fingerprint(base,DEFAULTS));
  assert.equal(fingerprint({...base,notes:'n'},DEFAULTS),fingerprint(base,DEFAULTS));
});

test('config: normalizeModel trims and bounds, defaults enabled, guards headers and id',()=>{
  const m=normalizeModel({name:'  A  ',modelId:'  b  ',host:'https://example.com/v1/',protocol:'chat'});
  assert.equal(m.name,'A');assert.equal(m.modelId,'b');
  assert.equal(m.host,'https://example.com/v1');assert.equal(m.enabled,true);
  assert.equal(m.reasoning,'');assert.equal(m.context,null);
  // 非法 id 与过长备注被拒绝
  assert.throws(()=>normalizeModel({...m,id:''}));
  assert.throws(()=>normalizeModel({...m,id:'x'.repeat(101)}));
  // context 视为未设置时返回 null，越界则被拒
  assert.equal(normalizeModel({...m,context:0}).context,null);
  assert.throws(()=>normalizeModel({...m,context:100000001}));
  // jsonObject 直接拒绝数组和超大对象
  assert.throws(()=>jsonObject('[1]','额外参数'));
  assert.throws(()=>jsonObject({a:'x'.repeat(20000)},'额外参数'));
  assert.throws(()=>int(1.5,1,5,'测试'));
});

test('store: history filters by model and days, order and metadata survive',async()=>{
  const {s,dir,cleanup}=await tempStore();try{
    const now=Date.now();
    s.saveModel({id:'a',name:'A'},null);
    s.addResult({modelId:'a',status:'success',timestamp:new Date(now-1000).toISOString()},'r1');
    s.addResult({modelId:'a',status:'error',timestamp:new Date(now-10).toISOString()},'r2');
    s.addResult({modelId:'a',status:'success',timestamp:new Date(now-200*86400000).toISOString()},'r3');
    // 默认 7 天窗口只返回两条
    const all=s.history({days:7});
    assert.equal(all.length,2);
    // 倒序排列：最新在前
    assert.equal(all[0].status,'error');
    assert.ok(all[0].roundId&&all[0].id!==undefined);
    // 按模型过滤
    assert.equal(s.history({modelId:'a',days:7}).length,2);
    assert.equal(s.history({modelId:'missing',days:7}).length,0);
    // 扩大窗口包含旧记录
    assert.equal(s.history({days:365}).length,3);
  }finally{cleanup();}
});

test('store: stats counts last 24h excluding cancelled',async()=>{
  const {s,dir,cleanup}=await tempStore();try{
    s.addResult({modelId:'a',status:'success',timestamp:new Date().toISOString()},'r');
    s.addResult({modelId:'a',status:'error',timestamp:new Date().toISOString()},'r');
    s.addResult({modelId:'a',status:'cancelled',timestamp:new Date().toISOString()},'r');
    s.addResult({modelId:'a',status:'success',timestamp:new Date(Date.now()-2*86400000).toISOString()},'r');
    assert.deepEqual(s.stats(),{total:2,success:1});
  }finally{cleanup();}
});

test('store: latest returns newest per model and prune cleans history and notifications',async()=>{
  const {s,dir,cleanup}=await tempStore();try{
    const now=Date.now();
    s.saveModel({id:'a',name:'A'},null);
    s.addResult({modelId:'a',status:'success',timestamp:new Date(now-5000).toISOString()},'r1');
    s.addResult({modelId:'a',status:'error',timestamp:new Date(now-1000).toISOString()},'r2');
    const latest=s.latest();
    assert.equal(latest.length,1);assert.equal(latest[0].status,'error');
    // 通知写入与全量清空
    s.addNotification({kind:'ranking',text:'x'});s.addNotification({kind:'ranking',text:'y'});
    let ns=s.notifications();
    assert.equal(ns.length,2);assert.equal(ns[0].kind,'ranking');assert.equal(ns[0].read,false);
    s.clearNotifications();assert.equal(s.notifications().length,0);
    s.addNotification({kind:'error',text:'keep'});
    // prune：清掉 2 天前历史，最近的记录保留；通知不受影响
    s.addResult({modelId:'a',status:'success',timestamp:new Date(now-3*86400000).toISOString()},'old');
    s.prune(2);
    assert.equal(s.history({days:3650}).length,2);
    assert.equal(s.notifications().length,1);
  }finally{cleanup();}
});

test('scheduler: configure validates cron and errors propagate to onError',async()=>{
  let runs=0,errs=[];
  const s=new Scheduler(()=>{runs++;},e=>errs.push(e));
  try{
    s.configure({...DEFAULTS,scheduleEnabled:true});
    assert.ok(s.next());
    // 直接触发底层 cron job，模拟 run 抛错进入 onError
    await s.job.trigger();
    assert.equal(runs,1);
    // 无效 cron 在 configure 时即抛出
    assert.throws(()=>s.configure({...DEFAULTS,cron:'not a cron'}));
  }finally{s.stop();}
  assert.equal(errs.length,0);
});

test('scheduler: next is null when disabled or after suspend, configure re-enables',async()=>{
  const s=new Scheduler(()=>{});
  try{
    assert.equal(s.next(),null);
    s.configure({...DEFAULTS,scheduleEnabled:false});
    assert.equal(s.next(),null);
    s.configure({...DEFAULTS,scheduleEnabled:true});
    assert.ok(s.next());
    s.suspend();
    assert.equal(s.next(),null);
    s.resume();
    assert.ok(s.next());
  }finally{s.stop();}
});

test('ranking: exactly-at-threshold triggers, below does not; signature change resets streak',()=>{
  const res=(a,b,sa='s1',sb='s1')=>[
    {modelId:'a',modelName:'a',fingerprint:sa,status:'success',estimated:false,tokensPerSecond:a},
    {modelId:'b',modelName:'b',fingerprint:sb,status:'success',estimated:false,tokensPerSecond:b},
  ];
  // 第一轮 a 领先建立基准；随后 b 以恰好 5% 反超，连续两轮确认触发
  let out=evaluateRanking({},res(100,95));
  assert.equal(out.changes.length,0);
  out=evaluateRanking(out.state,res(100,105));
  assert.equal(out.changes.length,0); // 第一轮反超仅记 1 次
  out=evaluateRanking(out.state,res(100,105));
  assert.equal(out.changes.length,1); // 第二轮确认触发
  // 4.9% 反超始终达不到阈值
  out=evaluateRanking({},res(100,95));
  out=evaluateRanking(out.state,res(100,104.9));
  out=evaluateRanking(out.state,res(100,104.9));
  assert.equal(out.changes.length,0);
  // 指纹变化重置连击：先 5% 反超一轮，换指纹后从零开始，最终不触发
  out=evaluateRanking({},res(100,95));
  out=evaluateRanking(out.state,res(100,105)); // streak=1
  out=evaluateRanking(out.state,res(100,105,'s1','s2')); // 指纹变化，accepted 重置为 b
  out=evaluateRanking(out.state,res(100,105,'s1','s2')); // b 始终是 accepted，不再触发
  assert.equal(out.changes.length,0);
});

test('ranking: zero/negative speed and non-success are filtered',()=>{
  const out=evaluateRanking({},[
    {modelId:'a',modelName:'a',fingerprint:'s',status:'success',estimated:false,tokensPerSecond:0},
    {modelId:'b',modelName:'b',fingerprint:'s',status:'success',estimated:false,tokensPerSecond:100},
    {modelId:'c',modelName:'c',fingerprint:'s',status:'error',estimated:false,tokensPerSecond:99},
  ]);
  assert.equal(out.changes.length,0);
  assert.deepEqual(out.state,{pairs:{}});
});

test('benchmark: chat finish_reason length marks truncated',async()=>{
  const {benchmark}=require('../src/core/benchmark.cjs');
  const m=normalizeModel({name:'F',modelId:'t',host:'https://example.test/v1',protocol:'chat'});
  const frames=[{choices:[{delta:{content:'hello'}}]},{choices:[{delta:{},finish_reason:'length'}]},{choices:[],usage:{completion_tokens:5}},'[DONE]'];
  const stream=async()=>new Response(new ReadableStream({start(c){
    const text=frames.map(f=>'data: '+(typeof f==='string'?f:JSON.stringify(f))+'\r\n\r\n').join('');
    const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=5)c.enqueue(bytes.slice(i,i+5));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
  const r=await benchmark(m,{headers:{}},DEFAULTS,{fetchImpl:stream});
  assert.equal(r.status,'success');assert.equal(r.truncated,true);assert.equal(r.estimated,false);
});
