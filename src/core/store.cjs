'use strict';
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { DEFAULTS } = require('./config.cjs');
class Store {
  static async open(directory) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const SQL=await initSqlJs({locateFile: file=>require.resolve(`sql.js/dist/${file}`)});
    const file=path.join(directory,'model-pulse.sqlite');
    const db=fs.existsSync(file)?new SQL.Database(fs.readFileSync(file)):new SQL.Database();
    return new Store(directory,file,db);
  }
  constructor(directory,file,db) {
    this.directory=directory;this.file=file;this.db=db;
    db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, config TEXT NOT NULL, secret TEXT);
      CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT NOT NULL, round_id TEXT NOT NULL, timestamp TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS results_model_time ON results(model_id,timestamp);
      CREATE INDEX IF NOT EXISTS results_time ON results(timestamp);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, data TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0);`);
    this.flush();
  }
  rows(sql,params=[]) {const s=this.db.prepare(sql);try{s.bind(params);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}}
  flush(){const temp=this.file+'.tmp';fs.writeFileSync(temp,Buffer.from(this.db.export()),{mode:0o600});fs.renameSync(temp,this.file);}
  transaction(fn) {this.db.run('BEGIN');try{const value=fn();this.db.run('COMMIT');this.flush();return value;}catch(err){try{this.db.run('ROLLBACK');}catch{}throw err;}}
  get(key,fallback){const row=this.rows('SELECT value FROM kv WHERE key=?',[key])[0];return row?JSON.parse(row.value):fallback;}
  set(key,value){this.db.run('INSERT OR REPLACE INTO kv VALUES (?,?)',[key,JSON.stringify(value)]);}
  settings(){return {...DEFAULTS,...this.get('settings',{}),threshold:DEFAULTS.threshold,confirmations:DEFAULTS.confirmations};}
  models(){return this.rows('SELECT config,secret FROM models').map(r=>({...JSON.parse(r.config),hasSecret:!!r.secret}));}
  model(id){return this.models().find(m=>m.id===id);}
  secret(id){return this.rows('SELECT secret FROM models WHERE id=?',[id])[0]?.secret||null;}
  saveModel(model,secret){this.transaction(()=>{this.db.run('INSERT OR REPLACE INTO models VALUES (?,?,?)',[model.id,JSON.stringify(model),secret]);const ranking=this.get('ranking',{});ranking.pairs=Object.fromEntries(Object.entries(ranking.pairs||{}).filter(([k])=>!JSON.parse(k).includes(model.id)));this.set('ranking',ranking);});}
  deleteModel(id){this.transaction(()=>{this.db.run('DELETE FROM models WHERE id=?',[id]);this.set('ranking',{});});}
  addResult(result,roundId){this.transaction(()=>this.db.run('INSERT INTO results(model_id,round_id,timestamp,data) VALUES (?,?,?,?)',[result.modelId,roundId,result.timestamp,JSON.stringify(result)]));}
  history({modelId='',days=7,limit=1000}={}) {const since=new Date(Date.now()-days*86400000).toISOString();const where=modelId?'timestamp>=? AND model_id=?':'timestamp>=?';return this.rows(`SELECT id,round_id,data FROM results WHERE ${where} ORDER BY timestamp DESC LIMIT ?`,modelId?[since,modelId,limit]:[since,limit]).map(r=>({...JSON.parse(r.data),id:r.id,roundId:r.round_id}));}
  latest(){return this.rows('SELECT data FROM results WHERE id IN (SELECT MAX(id) FROM results GROUP BY model_id)').map(r=>JSON.parse(r.data));}
  stats(){const rows=this.rows('SELECT data FROM results WHERE timestamp>=?',[new Date(Date.now()-86400000).toISOString()]).map(r=>JSON.parse(r.data)).filter(r=>r.status!=='cancelled');return {total:rows.length,success:rows.filter(r=>r.status==='success').length};}
  recentByModel({limit=5,source=''}={}) {const grouped={};for(const row of this.rows('SELECT data FROM results ORDER BY id DESC LIMIT 10000')){const sample=JSON.parse(row.data);if(source&&sample.source!==source)continue;if(!grouped[sample.modelId])grouped[sample.modelId]=[];if(grouped[sample.modelId].length<limit)grouped[sample.modelId].push(sample);}return grouped;}
  overview(){const since=new Date(Date.now()-86400000).toISOString(),rows=this.rows('SELECT round_id,data FROM results WHERE timestamp>=? ORDER BY id DESC',[since]).map(row=>({roundId:row.round_id,...JSON.parse(row.data)}));const latestRound=rows[0]?.runId||rows[0]?.roundId;const last=latestRound?rows.filter(row=>(row.runId||row.roundId)===latestRound):[];return {incidents24h:rows.filter(row=>row.status==='error'||row.validation==='invalid').length,lastRun:{total:last.length,success:last.filter(row=>row.status==='success').length,valid:last.filter(row=>row.status==='success'&&row.validation!=='invalid').length}};}
  addNotification(data){this.db.run('INSERT INTO notifications(timestamp,data) VALUES (?,?)',[new Date().toISOString(),JSON.stringify(data)]);}
  notifications(){return this.rows('SELECT * FROM notifications ORDER BY id DESC LIMIT 100').map(r=>({id:r.id,timestamp:r.timestamp,read:!!r.read,...JSON.parse(r.data)}));}
  clearNotifications(){this.transaction(()=>this.db.run('DELETE FROM notifications'));}
  clearHistory(){this.transaction(()=>{this.db.run('DELETE FROM results');this.set('ranking',{});});}
  prune(days){this.transaction(()=>{this.db.run('DELETE FROM results WHERE timestamp<?',[new Date(Date.now()-days*86400000).toISOString()]);this.db.run('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY id DESC LIMIT 500)');});}
  close(){this.flush();this.db.close();}
}
module.exports={Store};
