const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('main window exposes version-only footer and destructive notification clear',()=>{
  const html=read('src/renderer/index.html'),app=read('src/renderer/app.js');
  assert.match(html,/id="version"/);assert.doesNotMatch(html,/id="runtimeStatus"|id="dataDirectory"/);
  assert.match(html,/id="clearNotifications"/);assert.doesNotMatch(html,/id="markRead"/);assert.match(app,/clearNotifications\(\)/);
});

test('settings and schedule are independent child-window pages',()=>{
  const main=read('src/main.cjs'),settings=read('src/renderer/settings.html'),schedule=read('src/renderer/schedule.html');
  assert.match(main,/settingsWindow/);assert.match(main,/scheduleWindow/);assert.match(main,/settings\.html/);assert.match(main,/schedule\.html/);
  assert.doesNotMatch(settings,/id="threshold"|id="confirmations"/);assert.match(settings,/id="settingsForm"/);assert.match(schedule,/id="scheduleForm"/);
  assert.match(main,/放弃未保存的修改/);
});

test('history uses ECharts dataZoom and synchronizes legend selection',()=>{
  const pkg=require('../package.json'),html=read('src/renderer/index.html'),chart=read('src/renderer/chart.js'),app=read('src/renderer/app.js');
  assert.ok(pkg.dependencies.echarts);assert.match(html,/echarts\.min\.js/);assert.match(chart,/type:'slider'/);assert.match(chart,/legendselectchanged/);assert.match(chart,/datazoom/);
  assert.match(app,/historyVisibility/);assert.match(app,/renderHistoryRows/);assert.match(app,/historyMetric'\)\.onchange=renderHistoryChart/);
});

test('window bar and tabs both use sticky positioning',()=>{
  const css=read('src/renderer/styles.css');assert.match(css,/\.windowbar\{position:sticky/);assert.match(css,/main>\.tabs\{position:sticky/);
});

test('professional overview exposes health metrics and both benchmark modes',()=>{const html=read('src/renderer/index.html'),app=read('src/renderer/app.js');for(const id of ['healthyCount','lastRunSuccess','p50Ttft','p50Generation','incidentCount','nextRun','benchmarkAll'])assert.match(html,new RegExp(`id="${id}"`));assert.match(app,/runTests\([^)]*'standard'/);assert.match(app,/summary\.health/);assert.match(app,/generation\?\.p50/);});

test('history offers professional metrics, diagnostics filters and safe export controls',()=>{const html=read('src/renderer/index.html'),app=read('src/renderer/app.js'),preload=read('src/preload.cjs');for(const value of ['generationTokensPerSecond','charactersPerSecond'])assert.match(html,new RegExp(`value="${value}"`));for(const id of ['historyMode','historyStatus','historyError','exportCsv','exportJson'])assert.match(html,new RegExp(`id="${id}"`));assert.match(app,/exportHistory/);assert.match(preload,/history:export/);});
