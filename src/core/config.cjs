'use strict';
const crypto = require('node:crypto');
const PROMPT = 'Output the numbers 1 through 120 separated by a single space. No commas, no newlines, no explanation.';
const DEFAULTS = { cron: '0 * * * *', scheduleEnabled: false, autoStart: false, desktopNotifications: true, threshold: 5, confirmations: 2, prompt: PROMPT, maxTokens: 1024, timeout: 45, retentionDays: 90 };
const PATHS = { chat: '/chat/completions', responses: '/responses', anthropic: '/messages' };
function int(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`${label}需在 ${min}–${max} 之间`);
  return n;
}
function jsonObject(value, label) {
  if (!value) return {};
  let result = value;
  if (typeof value === 'string') { try { result = JSON.parse(value); } catch { throw Error(`${label}不是有效 JSON`); } }
  if (!result || Array.isArray(result) || typeof result !== 'object') throw Error(`${label}必须为 JSON 对象`);
  if (JSON.stringify(result).length > 16384) throw Error(`${label}过长`);
  return result;
}
function normalizeModel(input) {
  if (!input || typeof input !== 'object') throw Error('无效模型配置');
  const name = String(input.name || '').trim(), modelId = String(input.modelId || '').trim();
  if (!name || !modelId || name.length > 100 || modelId.length > 200) throw Error('请填写有效的显示名称和模型 ID');
  if (!Object.hasOwn(PATHS,input.protocol)) throw Error('不支持的接口协议');
  if (input.id != null && (typeof input.id !== 'string' || input.id.length > 100 || !input.id)) throw Error('模型标识无效');
  let url; try { url = new URL(input.host); } catch { throw Error('接口基础地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('基础地址须为 HTTP(S)，不能包含凭据、查询参数或片段');
  const extra = jsonObject(input.extra, '额外参数');
  for (const k of ['model','stream','messages','input','max_tokens','max_completion_tokens','max_output_tokens','stream_options']) if (k in extra) throw Error(`额外参数不能覆盖 ${k}`);
  const reasoning = input.reasoning || '';
  if (!['','low','medium','high'].includes(reasoning)) throw Error('推理强度无效');
  return { id: input.id || crypto.randomUUID(), name, modelId, protocol: input.protocol, host: url.href.replace(/\/+$/, ''), enabled: input.enabled !== false, extra, reasoning, context: input.context ? int(input.context, 1, 100000000, '上下文窗口') : null, notes: String(input.notes || '').slice(0,2000) };
}
function endpoint(model) {
  const host = model.host.replace(/\/+$/, '');
  const suffix = PATHS[model.protocol];
  return host.endsWith(suffix) ? host : host + suffix;
}
function normalizeSettings(input) {
  if (!input || typeof input !== 'object') throw Error('设置无效');
  const prompt = String(input.prompt || '').trim();
  if (!prompt || prompt.length > 16000) throw Error('测试提示词不能为空且不能超过 16000 字符');
  return { cron: String(input.cron || '').trim(), scheduleEnabled: !!input.scheduleEnabled, autoStart: !!input.autoStart, desktopNotifications: !!input.desktopNotifications, threshold: DEFAULTS.threshold, confirmations: DEFAULTS.confirmations, prompt, maxTokens: int(input.maxTokens, 1, 131072, '最大输出 tokens'), timeout: int(input.timeout, 5, 600, '超时'), retentionDays: int(input.retentionDays, 1, 3650, '历史保留天数') };
}
function fingerprint(model, settings) {
  return crypto.createHash('sha256').update(JSON.stringify([model.protocol, model.host, model.modelId, model.extra, model.reasoning, settings.prompt, settings.maxTokens, settings.timeout])).digest('hex');
}
module.exports = { DEFAULTS, PROMPT, PATHS, int, jsonObject, normalizeModel, normalizeSettings, endpoint, fingerprint };
