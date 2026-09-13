'use strict';

const PROFILE = 'numbers-1-120-v1';
const CUSTOM_PROFILE = 'custom-v1';

function expectedNumericSequence() {
  return Array.from({ length: 120 }, (_, index) => String(index + 1)).join(' ');
}

function validateOutput(prompt, output, builtinPrompt) {
  if (prompt !== builtinPrompt) return { state: 'unchecked', profile: CUSTOM_PROFILE };
  return { state: output === expectedNumericSequence() ? 'valid' : 'invalid', profile: PROFILE };
}

module.exports = { PROFILE, CUSTOM_PROFILE, expectedNumericSequence, validateOutput };
