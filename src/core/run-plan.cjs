'use strict';

const MODES = new Set(['quick', 'standard', 'scheduled']);
function shuffled(values, random) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}
function buildRunPlan(modelIds, mode = 'quick', random = Math.random) {
  if (!MODES.has(mode)) throw Error('运行模式无效');
  const rounds = mode === 'standard' ? [{ round: 0, warmup: true }, { round: 1, warmup: false }, { round: 2, warmup: false }, { round: 3, warmup: false }] : [{ round: 1, warmup: false }];
  return rounds.flatMap(({ round, warmup }) => shuffled(modelIds, random).map((modelId, position) => ({ modelId, round, warmup, position })));
}

module.exports = { MODES, shuffled, buildRunPlan };
