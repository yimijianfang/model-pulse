'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {safeHistoryRows,toCsv}=require('../src/core/export.cjs');
test('history export keeps metrics and removes secrets, prompt and output text',()=>{const rows=safeHistoryRows([{modelId:'a',modelName:'A',timestamp:'2026-01-01',status:'success',apiKey:'secret',headers:{Authorization:'secret'},text:'private',settings:{prompt:'private'},generationTokensPerSecond:42}]);assert.equal(rows[0].generationTokensPerSecond,42);assert.ok(!JSON.stringify(rows).includes('secret'));assert.ok(!JSON.stringify(rows).includes('private'));});
test('CSV export quotes commas, quotes and newlines',()=>{const csv=toCsv([{modelName:'A, "fast"\nmodel',status:'success'}]);assert.match(csv,/"A, ""fast""\nmodel"/);assert.ok(csv.startsWith('\uFEFF'));});
