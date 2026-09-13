'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, percentile, aggregateSamples, summarizeModel } = require('../src/core/aggregate.cjs');

test('median and nearest-rank percentile are deterministic', () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 3, 5, 7]), 4);
  assert.equal(percentile([1, 2, 3, 4, 100], 0.95), 100);
});

test('aggregation excludes invalid, failed and estimated token samples', () => {
  const sample = (value, extra = {}) => ({ status: 'success', validation: 'valid', usageSource: 'provider', generationTokensPerSecond: value, ...extra });
  const result = aggregateSamples([
    sample(100), sample(110), sample(90),
    sample(1000, { validation: 'invalid' }),
    sample(1000, { usageSource: 'estimated' }),
    sample(null, { status: 'error' })
  ], 'generationTokensPerSecond');
  assert.equal(result.total, 6);
  assert.equal(result.eligible, 3);
  assert.equal(result.p50, 100);
  assert.equal(result.p95, 110);
  assert.equal(result.stability, 'stable');
  assert.ok(result.coefficientOfVariation > 0);
});

test('character throughput permits estimated token usage', () => {
  const result = aggregateSamples([{ status: 'success', validation: 'unchecked', usageSource: 'estimated', charactersPerSecond: 42 }], 'charactersPerSecond');
  assert.equal(result.eligible, 1);
  assert.equal(result.p50, 42);
});

test('model summary requires three eligible samples and reports rolling medians', () => {
  const samples = [100, 110, 90].map((value, index) => ({ timestamp: new Date(2026, 0, index + 1).toISOString(), status: 'success', validation: 'valid', usageSource: 'provider', generationTokensPerSecond: value, ttftMs: 200 + index * 10 }));
  const summary = summarizeModel(samples);
  assert.equal(summary.health, 'healthy');
  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.successRate, 100);
  assert.equal(summary.generation.p50, 100);
  assert.equal(summary.ttft.p50, 210);
});

test('model summary distinguishes insufficient data and repeated outages', () => {
  assert.equal(summarizeModel([]).health, 'insufficient');
  assert.equal(summarizeModel([{ status: 'error' }, { status: 'error' }]).health, 'unavailable');
});
