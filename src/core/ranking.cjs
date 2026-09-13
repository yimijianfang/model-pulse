'use strict';
// Pairwise hysteresis: membership changes and failed/estimated samples are excluded.
// Confirm an inversion relative to the last accepted order, rather than last raw order.
function evaluateRanking(previous = {}, results, threshold = 5, confirmations = 2) {
  const valid = results.filter(r=>r.status==='success' && r.validation!=='invalid' && !r.estimated && r.usageSource!=='estimated' && (r.eligibleSamples==null||r.eligibleSamples>=3) && Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond>0);
  const old = previous.pairs || {}, pairs = {}, changes = [];
  for (let i=0;i<valid.length;i++) for(let j=i+1;j<valid.length;j++) {
    const [a,b] = [valid[i],valid[j]].sort((x,y)=>x.modelId.localeCompare(y.modelId));
    if(a.comparisonKey&&b.comparisonKey&&a.comparisonKey!==b.comparisonKey)continue;
    const key = JSON.stringify([a.modelId,b.modelId]);
    const signature = JSON.stringify([a.fingerprint,b.fingerprint]);
    const winner = a.tokensPerSecond>=b.tokensPerSecond?a:b, loser = winner===a?b:a;
    const state = old[key]?.signature===signature ? {...old[key]} : { signature, accepted: winner.modelId, streak:0 };
    if (winner.modelId!==state.accepted && (winner.tokensPerSecond/loser.tokensPerSecond-1)*100>=threshold) {
      state.streak++;
      if (state.streak>=confirmations) { changes.push({ winner: winner.modelId, loser:loser.modelId, text:`${winner.modelName} 超过 ${loser.modelName}`, leadPercent:(winner.tokensPerSecond/loser.tokensPerSecond-1)*100 });state.accepted=winner.modelId;state.streak=0; }
    } else state.streak=0;
    pairs[key]=state;
  }
  return { state:{ pairs }, changes };
}
function evaluateMonitoring(previous = {}, summaries, confirmations = 2) {
  const state={},events=[];
  for(const summary of summaries){
    const old=previous[summary.modelId]||{},next={outageStreak:0,outageAlerted:false,degradationStreak:0,degradationAlerted:false};
    if(summary.health==='unavailable'){
      next.outageStreak=(old.outageStreak||0)+1;next.outageAlerted=!!old.outageAlerted;
      if(next.outageStreak>=confirmations&&!next.outageAlerted){events.push({type:'availability',modelId:summary.modelId,title:`${summary.modelName} 连续不可用`,body:`连续 ${next.outageStreak} 轮失败 · ${summary.latest?.errorCategory||'unknown'}`});next.outageAlerted=true;}
    }
    if(summary.health==='degraded'){
      next.degradationStreak=(old.degradationStreak||0)+1;next.degradationAlerted=!!old.degradationAlerted;
      if(next.degradationStreak>=confirmations&&!next.degradationAlerted){events.push({type:'performance',modelId:summary.modelId,title:`${summary.modelName} 性能下降`,body:`生成吞吐相对上一窗口下降 ${Math.abs(summary.deltaPercent).toFixed(1)}%`});next.degradationAlerted=true;}
    }
    state[summary.modelId]=next;
  }
  return {state,events};
}
module.exports = { evaluateRanking, evaluateMonitoring };
