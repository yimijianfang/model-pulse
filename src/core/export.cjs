'use strict';
const FIELDS=['timestamp','modelName','modelId','protocol','source','mode','runId','round','status','errorCategory','validation','benchmarkProfile','usageSource','outputTokens','outputCharacters','ttftMs','generationMs','totalMs','generationTokensPerSecond','charactersPerSecond','effectiveTokensPerSecond','estimated','truncated'];
function safeHistoryRows(rows){return rows.map(row=>Object.fromEntries(FIELDS.map(field=>[field,row[field]??null])));}
function cell(value){const text=value==null?'':String(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function toCsv(rows){return '\uFEFF'+[FIELDS.join(','),...rows.map(row=>FIELDS.map(field=>cell(row[field])).join(','))].join('\r\n');}
module.exports={FIELDS,safeHistoryRows,toCsv};
