'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, Notification, safeStorage, powerMonitor, dialog, nativeTheme }=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const { Store }=require('./core/store.cjs');
const { normalizeModel,normalizeSettings,jsonObject, fingerprint }=require('./core/config.cjs');
const { benchmark }=require('./core/benchmark.cjs');
const { Scheduler,previewCron }=require('./core/scheduler.cjs');
const { evaluateRanking }=require('./core/ranking.cjs');
const smoke=process.argv.includes('--smoke-test');
if(smoke){app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');}
const directory=process.env.MODELPULSE_DATA_DIR||path.join(os.homedir(),'.model-pulse');
app.setPath('userData',directory);
app.setAppUserModelId('io.modelpulse.desktop');
let store,main,editor,settingsWindow,scheduleWindow,tray,scheduler,quitting=false,busy=null,controller=null;
const renderer=path.join(__dirname,'renderer');
const windows=new Set();
function createWindow(options,page){
  const w=new BrowserWindow({...options,show:false,backgroundColor:'#111413',icon:path.join(__dirname,'../assets/icon.png'),autoHideMenuBar:true,...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{color:'#111413',symbolColor:'#e9f0ec',height:32}}:{}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  windows.add(w);w.on('closed',()=>windows.delete(w));
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',e=>e.preventDefault());
  w.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
  w.loadFile(path.join(renderer,page));w.once('ready-to-show',()=>{if(!smoke)w.show();});return w;
}
function showMain(view){if(!main||main.isDestroyed())return;if(!smoke){main.show();if(main.isMinimized())main.restore();main.focus();}if(view)main.webContents.send('navigate',view);}
function broadcast(){for(const w of windows)if(!w.isDestroyed())w.webContents.send('changed');}
function secureAvailable(){return safeStorage.isEncryptionAvailable()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text');}
function encrypt(secret){if(!secret.apiKey&&!Object.keys(secret.headers||{}).length)return null;if(!secureAvailable())throw Error('系统安全存储不可用，请先启用系统密钥环；密钥不会以明文保存');return safeStorage.encryptString(JSON.stringify(secret)).toString('base64');}
function decrypt(id){const s=store.secret(id);if(!s)return {apiKey:'',headers:{}};if(!secureAvailable())throw Error('系统密钥库不可用');try{return JSON.parse(safeStorage.decryptString(Buffer.from(s,'base64')));}catch{throw Error('无法解密此模型凭据，请重新填写密钥与请求头');}}
function autostart(enabled){
  if(!app.isPackaged){if(enabled)throw Error('请安装打包后的应用再启用开机启动');return;}
  if(process.platform==='linux'){
    const dir=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'autostart'),file=path.join(dir,'model-pulse.desktop');
    if(enabled){fs.mkdirSync(dir,{recursive:true});const executable=(process.env.APPIMAGE||process.execPath).replace(/([\\"`$])/g,'\\$1');fs.writeFileSync(file,`[Desktop Entry]\nType=Application\nName=ModelPulse\nExec="${executable}" --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);}else if(fs.existsSync(file))fs.unlinkSync(file);
  } else app.setLoginItemSettings({openAtLogin:enabled,path:process.execPath,args:['--hidden']});
}
function snapshot(){const models=store.models(),settings=store.settings();return {version:app.getVersion(),models,settings,latest:store.latest().map(r=>{const m=models.find(m=>m.id===r.modelId);return {...r,stale:!!m&&r.fingerprint!==fingerprint(m,settings)};}),stats:store.stats(),notifications:store.notifications(),busy,nextRun:scheduler.next(),directory,secureAvailable:secureAvailable(),packaged:app.isPackaged,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};}
async function runTests(ids,source='manual'){
  if(busy){if(source==='scheduled')return;throw Error('已有测试进行中，请等待或停止本轮');}
  const models=store.models().filter(m=>ids.includes(m.id));if(!models.length){if(source==='scheduled')return;throw Error('请先添加模型');}
  const settings=store.settings(),roundId=crypto.randomUUID(),results=[];
  controller=new AbortController();const signal=controller.signal;busy={source,roundId,total:models.length,done:0,current:null};broadcast();
  try{
    for(const model of models){
      if(signal.aborted)break;busy.current=model.id;broadcast();
      let result;try{result=await benchmark(model,decrypt(model.id),settings,{signal});}catch{result={modelId:model.id,modelName:model.name,protocol:model.protocol,fingerprint:fingerprint(model,settings),timestamp:new Date().toISOString(),status:'error',error:'凭据不可用，请重新保存模型密钥',tokensPerSecond:null,outputTokens:null,ttftMs:null,totalMs:0,estimated:false};}
      store.addResult({...result,source},roundId);results.push(result);busy.done++;broadcast();
    }
    if(source==='scheduled'&&!signal.aborted){
      const {state,changes}=evaluateRanking(store.get('ranking',{}),results,settings.threshold,settings.confirmations);
      store.transaction(()=>{store.set('ranking',state);if(changes.length)store.addNotification({type:'ranking',title:'模型速度排名发生变化',body:changes.map(c=>c.text).join('；'),roundId,changes});});
      if(changes.length&&settings.desktopNotifications&&Notification.isSupported()){
        const n=new Notification({title:'ModelPulse · 模型排名变化',body:changes.map(c=>c.text).join('；'),icon:path.join(__dirname,'../assets/icon.png')});n.on('click',()=>showMain('notifications'));n.show();
      }
    } else if(source==='scheduled'&&signal.aborted)store.transaction(()=>store.set('ranking',{}));
    store.prune(settings.retentionDays);
  } finally {busy=null;controller=null;broadcast();}
}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{try{const w=BrowserWindow.fromWebContents(event.sender);if(!w||!windows.has(w)||event.senderFrame!==event.sender.mainFrame||!event.senderFrame.url.startsWith(pathToFileURL(renderer+path.sep).href))throw Error('未授权的界面请求');return {ok:true,value:await fn(...args,w)};}catch(err){return {ok:false,error:err.message};}});}
function ensureIdle(){if(busy)throw Error('测试进行中，请停止本轮后修改配置');}
app.on('before-quit',()=>{quitting=true;scheduler?.stop();controller?.abort();});
app.on('window-all-closed',()=>{if(!tray)app.quit();});
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>showMain());
app.whenReady().then(async()=>{
  nativeTheme.themeSource='dark';
  store=await Store.open(directory);store.prune(store.settings().retentionDays);
  scheduler=new Scheduler(()=>runTests(store.models().filter(m=>m.enabled).map(m=>m.id),'scheduled'),()=>{store.transaction(()=>store.addNotification({type:'error',title:'定时测试未完成',body:'本轮执行发生错误，请检查本地存储与运行环境。'}));broadcast();});
  const area=screen.getPrimaryDisplay().workAreaSize,width=Math.min(1280,Math.round(area.width*.4)),height=Math.min(Math.round(width*.618),Math.round(area.height*.9));
  main=createWindow({title:'ModelPulse',width,height,minWidth:Math.min(400,width),minHeight:Math.min(260,height),maxWidth:1280,fullscreenable:false,maximizable:false},'index.html');
  main.on('close',e=>{if(!quitting&&tray){e.preventDefault();main.hide();}});
  main.on('show',()=>{if(process.argv.includes('--hidden')&&!main.__shown){main.__shown=true;main.hide();}});
  app.on('activate',()=>showMain());
  if(!smoke){
    try{const icon=nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).resize({width:20,height:20});tray=new Tray(icon);tray.setToolTip('ModelPulse');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 ModelPulse',click:()=>showMain()},{label:'测试所有参与定时的模型',click:()=>runTests(store.models().filter(m=>m.enabled).map(m=>m.id)).catch(()=>{})},{type:'separator'},{label:'退出',click:()=>app.quit()}]));tray.on('click',()=>showMain());}catch{tray=null;}
  }
  scheduler.configure(store.settings());
  powerMonitor.on('suspend',()=>{scheduler.suspend();controller?.abort();});powerMonitor.on('resume',()=>{scheduler.resume();broadcast();});
  handle('snapshot',()=>snapshot());
  handle('editor:open',id=>{if(editor&&!editor.isDestroyed()){editor.focus();return;}if(id&&!store.model(id))throw Error('模型不存在');editor=createWindow({title:id?'编辑模型 · ModelPulse':'添加模型 · ModelPulse',parent:main,width:Math.min(780,area.width-40),height:Math.min(900,Math.round(area.height*.9)),minWidth:Math.min(450,area.width-40),maxWidth:860,fullscreenable:false,maximizable:false},'editor.html');editor.modelId=id||null;editor.on('closed',()=>{editor=null;});});
  handle('preferences:open',kind=>{
    if(!['settings','schedule'].includes(kind))throw Error('设置类型无效');
    const existing=kind==='settings'?settingsWindow:scheduleWindow;
    if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return;}
    const spec=kind==='settings'?{title:'运行设置 · ModelPulse',page:'settings.html',width:Math.min(720,area.width-40),height:Math.min(780,Math.round(area.height*.9))}:{title:'设置计划 · ModelPulse',page:'schedule.html',width:Math.min(620,area.width-40),height:Math.min(760,Math.round(area.height*.9))};
    const w=createWindow({title:spec.title,parent:main,width:spec.width,height:spec.height,minWidth:Math.min(430,area.width-40),minHeight:480,maxWidth:820,fullscreenable:false,maximizable:false},spec.page);
    w.preferenceKind=kind;w.preferenceDirty=false;w.preferenceClosing=false;w.preferencePrompting=false;
    if(kind==='settings')settingsWindow=w;else scheduleWindow=w;
    w.on('close',event=>{if(!w.preferenceDirty||w.preferenceClosing)return;event.preventDefault();if(w.preferencePrompting)return;w.preferencePrompting=true;void dialog.showMessageBox(w,{type:'warning',buttons:['继续编辑','放弃修改'],defaultId:0,cancelId:0,message:'放弃未保存的修改？',detail:'关闭窗口后，本次修改不会保存。'}).then(answer=>{w.preferencePrompting=false;if(answer.response===1&&!w.isDestroyed()){w.preferenceClosing=true;w.close();}});});
    w.on('closed',()=>{if(kind==='settings')settingsWindow=null;else scheduleWindow=null;});
  });
  handle('preferences:data',w=>{if(!w.preferenceKind)throw Error('非设置窗口');return {kind:w.preferenceKind,settings:store.settings(),packaged:app.isPackaged,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};});
  handle('preferences:dirty',(value,w)=>{if(!w.preferenceKind)throw Error('非设置窗口');w.preferenceDirty=!!value;});
  handle('preferences:close',(saved,w)=>{if(!w.preferenceKind)throw Error('非设置窗口');w.preferenceDirty=false;w.preferenceClosing=true;if(saved&&main&&!main.isDestroyed())main.webContents.send('toast',w.preferenceKind==='settings'?'运行设置已保存':'全局计划已保存');w.close();});
  handle('editor:data',()=>({model:editor?.modelId?store.model(editor.modelId):null,settings:store.settings(),secureAvailable:secureAvailable()}));
  handle('editor:close',()=>editor?.close());
  handle('model:save',async(input,test)=>{
    ensureIdle();const model=normalizeModel(input);if(input.id&&!store.model(input.id))throw Error('模型已删除');
    const old=store.model(model.id),changedTarget=!!old&&(old.host!==model.host||old.protocol!==model.protocol);
    const apiKey=String(input.apiKey||'').trim(),headersText=String(input.headers||'').trim();
    if(apiKey.length>16384)throw Error('API 密钥过长');
    if(changedTarget&&old.hasSecret&&!apiKey&&!headersText&&!input.clearSecret)throw Error('更改地址或协议时，请重新填写凭据或清除原凭据');
    let cipher=old?store.secret(model.id):null;
    if(apiKey||headersText||input.clearSecret||changedTarget){
      // Never forward old custom credentials when the target origin/protocol changes.
      let secret=old&&!input.clearSecret&&!changedTarget?decrypt(model.id):{apiKey:'',headers:{}};
      if(apiKey)secret.apiKey=apiKey;
      if(headersText){secret.headers=jsonObject(headersText,'请求头');for(const [k,v]of Object.entries(secret.headers)){if(typeof v!=='string'||/[\r\n]/.test(k+v)||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/.test(k))throw Error('请求头名称无效或值不是单行字符串');if(['host','content-length','connection','transfer-encoding'].includes(k.toLowerCase()))throw Error('不能自定义传输层请求头');}}
      cipher=encrypt(secret);
    }
    store.saveModel(model,cipher);broadcast();if(test)void runTests([model.id]).catch(()=>{});return model.id;
  });
  handle('model:toggle',(id,enabled)=>{ensureIdle();const m=store.model(id);if(!m)throw Error('模型不存在');const {hasSecret,...config}=m;store.saveModel({...config,enabled:!!enabled},store.secret(id));broadcast();});
  handle('model:delete',async id=>{ensureIdle();if(!store.model(id))throw Error('模型不存在');const answer=await dialog.showMessageBox(main,{type:'question',buttons:['取消','删除'],defaultId:0,cancelId:0,message:'删除此模型配置？',detail:'历史测试记录会保留，密钥及配置将删除。'});if(answer.response===1){store.deleteModel(id);broadcast();}});
  handle('test:run',ids=>{if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('模型列表无效');if(!ids.length||ids.some(id=>!store.model(id)))throw Error('请选择有效模型');if(busy)throw Error('已有测试正在运行');void runTests(ids).catch(()=>{});});
  handle('test:stop',()=>controller?.abort());
  handle('cron:preview',expression=>previewCron(expression));
  handle('settings:save',input=>{ensureIdle();const value=normalizeSettings(input);previewCron(value.cron);const old=store.settings();if(old.autoStart!==value.autoStart)autostart(value.autoStart);store.transaction(()=>{store.set('settings',value);if(['prompt','maxTokens','timeout','threshold','confirmations'].some(k=>old[k]!==value[k]))store.set('ranking',{});});scheduler.configure(value);broadcast();return value;});
  handle('history',input=>{const days=Number(input?.days??7);if(![1,7,30,90,3650].includes(days))throw Error('历史范围无效');return store.history({modelId:String(input?.modelId||''),days,limit:3000});});
  handle('notifications:clear',async()=>{
    const answer=await dialog.showMessageBox(main,{type:'warning',buttons:['取消','清空全部通知'],defaultId:0,cancelId:0,message:'清空全部通知记录？',detail:'这会永久删除数据库中的全部通知，此操作无法撤销。'});
    if(answer.response!==1)return false;store.clearNotifications();broadcast();return true;
  });
  handle('history:clear',async()=>{
    ensureIdle();
    const answer=await dialog.showMessageBox(main,{type:'warning',buttons:['取消','清空全部历史'],defaultId:0,cancelId:0,message:'清空全部模型的所有测试历史？',detail:'这会永久删除数据库中的全部测试记录，不仅是当前筛选的 50 条。模型配置、密钥和通知记录保留，排名基准重新建立。此操作无法撤销。'});
    if(answer.response!==1)return false;
    ensureIdle();store.clearHistory();broadcast();return true;
  });
  handle('config:export',async()=>{const result=await dialog.showSaveDialog(main,{title:'导出模型配置（不含密钥）',defaultPath:'model-pulse-config.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return;const data={version:1,models:store.models().map(({hasSecret,...m})=>m)};fs.writeFileSync(result.filePath,JSON.stringify(data,null,2));return true;});
  handle('config:import',async()=>{ensureIdle();const result=await dialog.showOpenDialog(main,{title:'导入模型配置',filters:[{name:'JSON',extensions:['json']}],properties:['openFile']});if(result.canceled)return;const file=result.filePaths[0];if(fs.statSync(file).size>2000000)throw Error('配置文件超过 2MB');let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('配置文件不是有效 JSON');}if(data.version!==1||!Array.isArray(data.models)||data.models.length>100)throw Error('配置格式无效或模型超过 100 个');const models=data.models.map(m=>normalizeModel({...m,id:crypto.randomUUID(),enabled:false}));store.transaction(()=>{for(const m of models)store.db.run('INSERT INTO models VALUES (?,?,?)',[m.id,JSON.stringify(m),null]);});broadcast();return models.length;});
}).catch(err=>{dialog.showErrorBox('ModelPulse 启动失败',err.message);app.quit();});
}
