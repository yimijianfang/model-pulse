'use strict';
const { performance } = require('node:perf_hooks');
const { endpoint, fingerprint } = require('./config.cjs');
function requestSpec(model, secret, settings) {
  const body = { ...model.extra, model: model.modelId, stream: true };
  const headers = { ...secret.headers };
  // Replace protected headers case-insensitively rather than producing duplicates.
  for (const key of Object.keys(headers)) if (['content-type','accept',...(secret.apiKey?['authorization','x-api-key']:[])].includes(key.toLowerCase())) delete headers[key];
  headers['Content-Type'] = 'application/json'; headers.Accept = 'text/event-stream';
  if (model.protocol === 'anthropic') {
    if (secret.apiKey) headers['x-api-key'] = secret.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body.messages = [{ role: 'user', content: settings.prompt }]; body.max_tokens = settings.maxTokens;
    if (model.reasoning) throw Error('Anthropic 推理参数请通过额外参数配置 thinking；不支持 OpenAI reasoning_effort');
  } else {
    if (secret.apiKey) headers.Authorization = `Bearer ${secret.apiKey}`;
    if (model.protocol === 'responses') {
      body.input = settings.prompt; body.max_output_tokens = settings.maxTokens;
      if (model.reasoning) body.reasoning = { ...(body.reasoning || {}), effort: model.reasoning };
    } else {
      body.messages = [{ role: 'user', content: settings.prompt }]; body.max_completion_tokens = settings.maxTokens;
      body.stream_options = { include_usage: true };
      if (model.reasoning) body.reasoning_effort = model.reasoning;
    }
  }
  return { url: endpoint(model), headers, body };
}
// SSE events may cross arbitrary UTF-8 byte boundaries; tolerate CRLF and final frames.
async function* sse(stream) {
  const decoder = new TextDecoder(); let pending = '', event = [];
  function parse(lines) { const data = lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n'); return data || null; }
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 2000000) throw Error('SSE 事件超过大小限制');
    let pos;
    while ((pos = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0,pos).replace(/\r$/, ''); pending = pending.slice(pos+1);
      if (line === '') { const data = parse(event); event = []; if (data) yield data; }
      else event.push(line);
      if (event.reduce((n,l)=>n+l.length,0) > 2000000) throw Error('SSE 事件超过大小限制');
    }
  }
  pending += decoder.decode(); if (pending) event.push(pending.replace(/\r$/,''));
  const data = parse(event); if (data) yield data;
}
const positive = x => Number.isFinite(x) && x > 0;
async function benchmark(model, secret, settings, { signal, fetchImpl = fetch } = {}) {
  const start = performance.now(); let first = null, text = '', usage = null, reasoningTokens = null, completed = false, terminal = null, truncated = false;
  const result = { modelId: model.id, modelName: model.name, protocol: model.protocol, fingerprint: fingerprint(model, settings), timestamp: new Date().toISOString(), settings: { prompt: settings.prompt, maxTokens: settings.maxTokens, timeout: settings.timeout }, status: 'error', tokensPerSecond: null, outputTokens: null, ttftMs: null, estimated: false };
  try {
    const spec = requestSpec(model, secret, settings);
    const timeout = AbortSignal.timeout(settings.timeout * 1000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetchImpl(spec.url, { method: 'POST', headers: spec.headers, body: JSON.stringify(spec.body), signal: combined, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw Error(`HTTP ${response.status}：${response.status===401||response.status===403?'认证失败，请检查密钥和权限':response.status===429?'请求限流或额度不足':'服务商请求失败'}`); }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) { await response.body?.cancel(); throw Error('接口未返回 SSE 流，请检查协议和地址'); }
    for await (const raw of sse(response.body)) {
      if (raw === '[DONE]') { completed = true; terminal = performance.now(); break; }
      let event; try { event = JSON.parse(raw); } catch { throw Error('接口返回了无效 SSE JSON'); }
      if (event.error || event.type === 'error' || event.type === 'response.failed') throw Error('服务商返回流式错误；请检查模型、参数或额度');
      let delta = '';
      if (model.protocol === 'chat') {
        delta = event.choices?.[0]?.delta?.content || '';
        if (event.usage) { usage = event.usage.completion_tokens; reasoningTokens = event.usage.completion_tokens_details?.reasoning_tokens ?? null; }
        if (event.choices?.[0]?.finish_reason) { completed = true; terminal = performance.now(); truncated = event.choices[0].finish_reason === 'length'; }
      } else if (model.protocol === 'responses') {
        if (event.type === 'response.output_text.delta') delta = event.delta;
        if (['response.completed','response.incomplete'].includes(event.type)) {
          usage = event.response?.usage?.output_tokens; reasoningTokens = event.response?.usage?.output_tokens_details?.reasoning_tokens ?? null;
          if (event.type === 'response.incomplete' && event.response?.incomplete_details?.reason !== 'max_output_tokens') throw Error('Responses 响应未完成');
          truncated = event.type === 'response.incomplete'; completed = true; terminal = performance.now();
        }
      } else {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') delta = event.delta.text;
        if (event.type === 'message_start') usage = event.message?.usage?.output_tokens;
        if (event.type === 'message_delta') { if (event.usage) usage = event.usage.output_tokens; truncated = event.delta?.stop_reason === 'max_tokens'; }
        if (event.type === 'message_stop') { completed = true; terminal = performance.now(); }
      }
      if (typeof delta === 'string' && delta) { if (first === null && delta.trim()) first = performance.now(); text += delta; }
      if (text.length > 2000000) throw Error('输出超过安全大小上限');
      if (completed && model.protocol !== 'chat') break;
    }
    if (!completed) throw Error('连接提前结束，未收到完成事件');
    if (first === null || !text.trim()) throw Error('未收到文本输出，无法计算测速结果');
    const totalMs = Math.max((terminal ?? performance.now()) - start, 1);
    const estimated = !positive(usage); const outputTokens = estimated ? Math.max(1,Math.ceil([...text].length/4)) : usage;
    return { ...result, status: 'success', totalMs, ttftMs: first-start, outputTokens, reasoningTokens, estimated, truncated, tokensPerSecond: outputTokens/(totalMs/1000), error: null };
  } catch (err) {
    // Never expose upstream payloads or arbitrary error messages containing request secrets.
    const known = /^(HTTP \d{3}|接口|服务商|SSE|输出|连接|未收到|Responses|Anthropic)/.test(err.message);
    const message = signal?.aborted ? '测试已取消' : ['TimeoutError','AbortError'].includes(err.name) ? '请求超时' : known ? err.message : '网络请求失败，请检查地址、网络或 TLS 证书';
    return { ...result, status: signal?.aborted ? 'cancelled' : 'error', totalMs: performance.now()-start, ttftMs: first===null?null:first-start, error: message };
  }
}
module.exports = { sse, requestSpec, benchmark };
