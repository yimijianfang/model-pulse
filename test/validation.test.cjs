'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROMPT } = require('../src/core/config.cjs');
const { expectedNumericSequence, validateOutput } = require('../src/core/validation.cjs');

test('built-in benchmark accepts only the exact 1 through 120 sequence', () => {
  const expected = expectedNumericSequence();
  assert.deepEqual(validateOutput(PROMPT, expected, PROMPT), { state: 'valid', profile: 'numbers-1-120-v1' });
  assert.equal(validateOutput(PROMPT, expected.replace('119 120', '120 119'), PROMPT).state, 'invalid');
  assert.equal(validateOutput(PROMPT, `${expected}\n`, PROMPT).state, 'invalid');
});

test('custom prompts are explicitly unchecked', () => {
  assert.deepEqual(validateOutput('Say hello', 'hello', PROMPT), { state: 'unchecked', profile: 'custom-v1' });
});
