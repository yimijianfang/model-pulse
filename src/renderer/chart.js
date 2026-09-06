import {$,date,esc} from './shared.js';
const colors=['#6ee7ad','#a9bdf4','#e7c28d','#c5a9da','#96cacc','#d8b3ae'];
let chart;
const labels={tokensPerSecond:'端到端输出速度（tokens/s）',ttftMs:'首字延迟（ms）',totalMs:'总耗时（ms）'};
function segments(group,metric){const out=[];let segment=[],lastFingerprint=null;for(const r of group){const valid=r.status==='success'&&Number.isFinite(r[metric]);if(!valid||(lastFingerprint&&r.fingerprint!==lastFingerprint)){if(segment.length)out.push(segment);segment=[];}if(valid){segment.push(r);lastFingerprint=r.fingerprint;}}if(segment.length)out.push(segment);return out;}
export function drawChart(rows,metric,{selected={},zoom={start:0,end:100},onSelectionChange=()=>{},onZoomChange=()=>{}}={}){
  const label=labels[metric];$('chartTitle').textContent=label;
  if(!window.echarts)throw Error('ECharts 加载失败');
  if(!chart)chart=window.echarts.init($('chart'),null,{renderer:'canvas'});
  const sorted=[...rows].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));const groups=new Map();for(const r of sorted){if(!groups.has(r.modelId))groups.set(r.modelId,[]);groups.get(r.modelId).push(r);}
  const names=new Map([...groups].map(([id,group])=>[id,group[0].modelName||id]));const series=[];let colorIndex=0;
  for(const [id,group]of groups){const color=colors[colorIndex++%colors.length];for(const points of segments(group,metric))series.push({name:id,type:'line',smooth:.25,connectNulls:false,showSymbol:true,symbol:'circle',symbolSize:6,itemStyle:{color},lineStyle:{color,width:2},data:points.map(r=>({value:[new Date(r.timestamp).getTime(),r[metric]],symbol:r.estimated?'emptyCircle':'circle',modelName:r.modelName,estimated:r.estimated}))});}
  const usable=rows.filter(r=>r.status==='success'&&Number.isFinite(r[metric]));
  chart.off('legendselectchanged');chart.off('datazoom');
  chart.setOption({animationDuration:250,color:colors,backgroundColor:'transparent',textStyle:{color:'#98a79f',fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'},legend:{top:2,type:'scroll',data:[...groups.keys()],selected,formatter:id=>names.get(id)||id,textStyle:{color:'#cbd7d0'}},grid:{left:54,right:22,top:48,bottom:76,containLabel:false},tooltip:{trigger:'axis',backgroundColor:'#1a1f1d',borderColor:'#39453d',textStyle:{color:'#e9f0ec'},formatter:items=>items.map(item=>`${esc(names.get(item.seriesName)||item.seriesName)}<br>${date(item.value[0])} · ${Number(item.value[1]).toFixed(2)}${item.data.estimated?'（估算）':''}`).join('<br>')},xAxis:{type:'time',name:'测试时间（本机时区）',nameLocation:'middle',nameGap:55,axisLine:{lineStyle:{color:'#47534c'}},axisLabel:{color:'#98a79f'},splitLine:{show:false}},yAxis:{type:'value',name:metric==='tokensPerSecond'?'tokens/s':'ms',min:0,axisLabel:{color:'#98a79f'},splitLine:{lineStyle:{color:'#303934'}}},dataZoom:[{type:'inside',start:zoom.start,end:zoom.end},{type:'slider',start:zoom.start,end:zoom.end,bottom:18,height:22,borderColor:'#39453d',backgroundColor:'#151a17',fillerColor:'rgba(110,231,173,.18)',handleStyle:{color:'#6ee7ad',borderColor:'#6ee7ad'},textStyle:{color:'#98a79f'}}],series,graphic:usable.length?[]:[{type:'text',left:'center',top:'middle',style:{text:'完成一次成功测试后，这里会显示历史趋势。',fill:'#98a79f',font:'12px Segoe UI'}}]},{notMerge:true});
  chart.on('legendselectchanged',event=>onSelectionChange({...event.selected}));chart.on('datazoom',event=>{const value=event.batch?.[0]||event;onZoomChange({start:value.start??0,end:value.end??100});});
  const times=rows.map(r=>new Date(r.timestamp).getTime()).filter(Number.isFinite);$('chartCaption').textContent=times.length?`来源：本地历史 · ${date(Math.min(...times))} 至 ${date(Math.max(...times))} · ${rows.length} 次请求。拖动底部时间轴缩放；点击图例同步筛选测试记录。估算点为空心，失败及参数变化处断线。`:'来源：本地测试历史';
}
window.addEventListener('resize',()=>chart?.resize());
