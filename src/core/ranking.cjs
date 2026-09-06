'use strict';
// Pairwise hysteresis: membership changes and failed/estimated samples are excluded.
// Confirm an inversion relative to the last accepted order, rather than last raw order.
function evaluateRanking(previous = {}, results, threshold = 5, confirmations = 2) {
  const valid = results.filter(r=>r.status==='success' && !r.estimated && Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond>0);
  const old = previous.pairs || {}, pairs = {}, changes = [];
  for (let i=0;i<valid.length;i++) for(let j=i+1;j<valid.length;j++) {
    const [a,b] = [valid[i],valid[j]].sort((x,y)=>x.modelId.localeCompare(y.modelId));
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
module.exports = { evaluateRanking };
