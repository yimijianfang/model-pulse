'use strict';
const { Cron } = require('croner');
function previewCron(expression, now = new Date()) {
  if (typeof expression !== 'string' || expression.trim().split(/\s+/).length!==5) throw Error('请使用五段 Cron：分钟 小时 日期 月份 星期');
  let job;
  try { job = new Cron(expression, { paused: true }); const next = job.nextRuns(5,now); if(!next.length)throw Error();return next.map(d=>d.toISOString()); }
  catch { throw Error('Cron 表达式无效或没有未来执行时间'); }
  finally { job?.stop(); }
}
class Scheduler {
  constructor(run, onError=()=>{}) {this.run=run;this.onError=onError;this.job=null;this.suspended=false;}
  configure(settings) {previewCron(settings.cron);this.job?.stop();this.settings=settings;this.job=null;if(settings.scheduleEnabled&&!this.suspended)this.job=new Cron(settings.cron,{protect:true},()=>Promise.resolve(this.run()).catch(this.onError));}
  suspend(){this.suspended=true;this.job?.stop();this.job=null;}
  resume(){this.suspended=false;if(this.settings)this.configure(this.settings);}
  stop(){this.job?.stop();this.job=null;}
  next(){return this.job?.nextRun()?.toISOString()??null;}
}
module.exports = { previewCron, Scheduler };
