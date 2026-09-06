import {$} from './shared.js';
document.body.classList.toggle('windows',window.pulse.platform==='win32');
let settings,ready=false;
const dirty=()=>{if(ready)void window.pulse.setPreferencesDirty(true);};
async function init(){try{const data=await window.pulse.preferencesData();if(data.kind!=='settings')throw Error('设置窗口类型错误');settings=data.settings;for(const key of ['maxTokens','timeout','retentionDays','prompt'])$(key).value=settings[key];$('autoStart').checked=settings.autoStart;$('desktopNotifications').checked=settings.desktopNotifications;$('autoStart').disabled=!data.packaged;$('autoStartHint').textContent=data.packaged?'登录系统后启动并驻留托盘。':'开发运行时不可启用；安装打包后的应用即可设置。';ready=true;$('maxTokens').focus();}catch(err){$('error').textContent=err.message;}}
document.querySelectorAll('input,textarea').forEach(el=>{el.addEventListener('input',dirty);el.addEventListener('change',dirty);});
async function close(){try{await window.pulse.closePreferences(false);}catch(err){$('error').textContent=err.message;}}
$('cancel').onclick=$('cancelTop').onclick=close;document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
$('exportConfig').onclick=async()=>{try{if(await window.pulse.exportConfig())$('error').textContent='配置已导出，不含密钥和请求头。';}catch(err){$('error').textContent=err.message;}};
$('importConfig').onclick=async()=>{try{const count=await window.pulse.importConfig();if(count!=null)$('error').textContent=`已导入 ${count} 个模型，请补充密钥后启用。`;}catch(err){$('error').textContent=err.message;}};
$('settingsForm').onsubmit=async e=>{e.preventDefault();$('error').textContent='';const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const input={...settings};for(const key of ['maxTokens','timeout','retentionDays','prompt'])input[key]=$(key).value;input.autoStart=$('autoStart').checked;input.desktopNotifications=$('desktopNotifications').checked;await window.pulse.saveSettings(input);await window.pulse.closePreferences(true);}catch(err){$('error').textContent=err.message;buttons.forEach(b=>b.disabled=false);}};
init();
