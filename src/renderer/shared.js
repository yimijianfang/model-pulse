export const $=id=>document.getElementById(id);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const labels={chat:'Chat Completions',responses:'Responses',anthropic:'Anthropic Messages'};
export const format=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
export const date=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
let timer;
export function toast(message){const open=document.querySelector('dialog[open]');if(open){const error=open.querySelector('.error');if(error){error.textContent=message;return;}}$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
export async function act(fn){try{return await fn();}catch(err){toast(err.message);}}
