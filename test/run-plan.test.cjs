'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRunPlan } = require('../src/core/run-plan.cjs');

test('quick and scheduled modes issue one measured request per model', () => {
  for (const mode of ['quick', 'scheduled']) {
    const plan = buildRunPlan(['a', 'b'], mode, () => 0.5);
    assert.equal(plan.length, 2);
    assert.ok(plan.every(step => !step.warmup && step.round === 1));
  }
});

test('standard mode interleaves one warmup and three measured rounds', () => {
  let value = 0;
  const plan = buildRunPlan(['a', 'b', 'c'], 'standard', () => (value += 0.31) % 1);
  assert.equal(plan.length, 12);
  assert.equal(plan.filter(step => step.warmup).length, 3);
  assert.equal(plan.filter(step => !step.warmup).length, 9);
  for (const round of [0, 1, 2, 3]) assert.deepEqual(new Set(plan.filter(step => step.round === round).map(step => step.modelId)), new Set(['a', 'b', 'c']));
});

test('unknown run mode is rejected', () => {
  assert.throws(() => buildRunPlan(['a'], 'expensive'), /运行模式/);
});
