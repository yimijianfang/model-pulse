'use strict';

function finite(values) { return values.filter(Number.isFinite).sort((a, b) => a - b); }
function median(values) {
  const sorted = finite(values);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values, quantile) {
  const sorted = finite(values);
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil(Math.min(1, Math.max(0, quantile)) * sorted.length));
  return sorted[rank - 1];
}
function stabilityFor(value) { return value <= 0.1 ? 'stable' : value <= 0.25 ? 'moderate' : 'volatile'; }
function eligibleSample(sample, metric) {
  if (sample.status !== 'success' || sample.validation === 'invalid' || !Number.isFinite(sample[metric]) || sample[metric] <= 0) return false;
  return !metric.toLowerCase().includes('token') || sample.usageSource === 'provider' || (sample.usageSource == null && !sample.estimated);
}
function aggregateSamples(samples, metric) {
  const selected = samples.filter(sample => eligibleSample(sample, metric));
  const values = selected.map(sample => sample[metric]);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const variance = values.length && mean ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : null;
  const coefficientOfVariation = variance == null || !mean ? null : Math.sqrt(variance) / mean;
  return { metric, total: samples.length, eligible: selected.length, p50: median(values), p95: percentile(values, 0.95), coefficientOfVariation, stability: coefficientOfVariation == null ? 'insufficient' : stabilityFor(coefficientOfVariation) };
}
function summarizeModel(samples) {
  const ordered=[...samples].sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0));
  const current=ordered.slice(0,5),previous=ordered.slice(5,10),counted=current.filter(sample=>sample.status!=='cancelled');
  const generation=aggregateSamples(current,'generationTokensPerSecond'),ttft=aggregateSamples(current,'ttftMs'),characters=aggregateSamples(current,'charactersPerSecond');
  const prior=aggregateSamples(previous,'generationTokensPerSecond');
  const deltaPercent=generation.p50&&prior.p50?(generation.p50/prior.p50-1)*100:null;
  let health='healthy';
  if(current.slice(0,2).length===2&&current.slice(0,2).every(sample=>sample.status==='error'))health='unavailable';
  else if(generation.eligible<3)health='insufficient';
  else if(deltaPercent!=null&&deltaPercent<=-20)health='degraded';
  return {health,sampleCount:current.length,successRate:counted.length?counted.filter(sample=>sample.status==='success').length/counted.length*100:null,validRate:counted.length?counted.filter(sample=>sample.validation==='valid').length/counted.length*100:null,generation,ttft,characters,deltaPercent,latest:ordered[0]||null};
}

module.exports = { median, percentile, stabilityFor, eligibleSample, aggregateSamples, summarizeModel };
