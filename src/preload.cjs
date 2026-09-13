'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(name,...args)=>{const result=await ipcRenderer.invoke(name,...args);if(!result.ok)throw Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('pulse',{
  platform:process.platform,
  clearHistory:()=>invoke('history:clear'),
  clearNotifications:()=>invoke('notifications:clear'),
  snapshot:()=>invoke('snapshot'),openEditor:id=>invoke('editor:open',id),openPreferences:kind=>invoke('preferences:open',kind),preferencesData:()=>invoke('preferences:data'),setPreferencesDirty:value=>invoke('preferences:dirty',value),closePreferences:saved=>invoke('preferences:close',saved),editorData:()=>invoke('editor:data'),closeEditor:()=>invoke('editor:close'),saveModel:(model,test)=>invoke('model:save',model,test),toggleModel:(id,value)=>invoke('model:toggle',id,value),deleteModel:id=>invoke('model:delete',id),runTests:(ids,mode='quick')=>invoke('test:run',ids,mode),stopTests:()=>invoke('test:stop'),previewCron:value=>invoke('cron:preview',value),saveSettings:value=>invoke('settings:save',value),history:value=>invoke('history',value),exportConfig:()=>invoke('config:export'),importConfig:()=>invoke('config:import'),
  onChanged:callback=>{const fn=()=>callback();ipcRenderer.on('changed',fn);return()=>ipcRenderer.removeListener('changed',fn);},
  onNavigate:callback=>{const fn=(_e,view)=>callback(view);ipcRenderer.on('navigate',fn);return()=>ipcRenderer.removeListener('navigate',fn);},
  onToast:callback=>{const fn=(_e,message)=>callback(message);ipcRenderer.on('toast',fn);return()=>ipcRenderer.removeListener('toast',fn);}
});
