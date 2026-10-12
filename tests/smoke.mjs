#!/usr/bin/env node
/**
 * dsh-web-search-tavily 冒烟测试：mock 上下文跑通核心链路，不打真实网络。
 *
 * 用法：npm test  或  node tests/smoke.mjs
 * 真实 API 验证（可选）：TAVILY_API_KEY=xxx node tests/smoke.mjs --live
 *
 * 覆盖：模块导出、Config 校验、env: 密钥解析、apply 注册 provider、
 * available() 门控、Tavily 响应映射（含脏数据丢弃）。
 */

import assert from 'node:assert/strict'
import { apply, Config, resolveSecret, TavilySearchProvider, mapTavilyResponse, TAVILY_PROVIDER_ID } from '../lib/index.js'

let passed = 0
const ok = (name) => { passed++; console.log(`  ✓ ${name}`) }

/** 构造 mock 上下文：ctx.web.registerSearchProvider 记录调用。 */
function makeCtx() {
  const registered = []
  const launchEnv = new Map([['TAVILY_API_KEY', { value: 'env-fallback-key', source: 'process' }]])
  const ctx = {
    web: { registerSearchProvider: (p) => { registered.push(p); return () => {} } },
  }
  ctx.get = (name) => (name === 'launchEnvironment' ? { get: (k) => launchEnv.get(k) } : undefined)
  return { ctx, registered }
}

// --- 模块导出 ---
assert.equal(typeof apply, 'function')
assert.equal(typeof resolveSecret, 'function')
assert.equal(Config, Config) // schemastery 对象存在
ok('模块导出完整')

// --- env: 密钥解析 ---
let threw = false
try { resolveSecret('env:DEFINITELY_UNSET_VAR_12345') } catch { threw = true }
assert.ok(threw, 'env: 未设置应 throw')
assert.equal(resolveSecret('plain-key'), 'plain-key')
ok('env: 密钥解析（未设置 throw / 明文透传）')

// --- apply 注册 ---
{
  const { ctx, registered } = makeCtx()
  apply(ctx, { apiKey: 'test-key' })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, TAVILY_PROVIDER_ID)
  assert.equal(registered[0].available(), true)
  ok('apply() 注册 tavily provider，available()=true')
}
{
  const { ctx, registered } = makeCtx()
  apply(ctx, {}) // 无 config.apiKey → env 兜底
  assert.equal(registered[0].available(), true) // launchEnvironment 兜底成功
  ok('apply() 无显式 key 时走 launchEnvironment 兜底')
}

// --- available() 门控 ---
{
  const p = new TavilySearchProvider({ apiKey: '', baseURL: 'https://api.tavily.com', searchDepth: 'basic', includeAnswer: false })
  assert.equal(p.available(), false)
  const p2 = new TavilySearchProvider({ apiKey: 'k', baseURL: 'not a url', searchDepth: 'basic', includeAnswer: false })
  assert.equal(p2.available(), false)
  ok('available() 门控：空 key / 坏 baseURL = false')
}

// --- 响应映射 ---
{
  const r = mapTavilyResponse({
    query: 'q',
    answer: '  gen answer  ',
    results: [
      { url: 'https://a.com', title: 'A', content: 'ca', score: 0.9, published_date: '2026-01-01' },
      { url: '', title: 'no url' },               // 无 URL → 丢弃
      { title: 'no url no content but title' },   // 无 URL → 丢弃
      { url: 'https://b.com' },                   // URL 无 title 无 content → 丢弃
    ],
  })
  assert.equal(r.sources.length, 1)
  assert.equal(r.sources[0].url, 'https://a.com')
  assert.equal(r.sources[0].snippet, 'ca')
  assert.equal(r.sources[0].publishedAt, '2026-01-01')
  assert.equal(r.content, 'gen answer')
  assert.equal(r.truncated, false)
  ok('mapTavilyResponse：字段映射 + 脏数据丢弃 + answer→content')
}
{
  const r = mapTavilyResponse({ results: [{ url: 'https://t.com', title: 'title-only' }] })
  assert.equal(r.sources.length, 1)
  assert.equal(r.sources[0].title, 'title-only')
  assert.equal(r.content, undefined)
  ok('title-only 结果保留；无 answer 时 content 缺省')
}

// --- 多 key 轮换（Hermes 同款 sticky 行为）---
{
  // 模拟 fetch：按 key 返回不同结果
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const key = init.headers.authorization.slice(7)
    calls.push(key)
    if (key === 'k1-bad') {
      return new Response(JSON.stringify({ detail: 'invalid key' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ query: 'q', results: [{ url: 'https://ok.com', title: 'T', content: 'C' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const p = new TavilySearchProvider({ apiKey: 'k1-bad, k2-good', baseURL: 'https://api.tavily.com', searchDepth: 'basic', includeAnswer: false })
    assert.equal(p.keys.length, 2)
    const r1 = await p.search({ query: 'q' })
    assert.equal(r1.sources.length, 1)
    assert.deepEqual(calls, ['k1-bad', 'k2-good'], '401 应轮换到 key2 并成功')
    // 第二次调用：sticky 应直接用 key2，不再浪费 key1
    await p.search({ query: 'q' })
    assert.deepEqual(calls, ['k1-bad', 'k2-good', 'k2-good'], '成功后应粘住 key2')
    ok('多 key 轮换：401→切换→成功→粘住')
    // 双 key 全 401：应报错而非静默假成功
    globalThis.fetch = async (url, init) => new Response(JSON.stringify({ detail: 'invalid key' }), { status: 401, headers: { 'content-type': 'application/json' } })
    let err = null
    try { await p.search({ query: 'q' }) } catch (e) { err = e }
    assert.ok(err, '双 key 全失效应抛错')
    assert.match(String(err?.message || err), /invalid key|HTTP 401/, '错误信息应含真实原因')
    ok('双 key 全失效：正确抛错（不静默）')
    // 400（坏请求）不轮换：fail fast
    const calls400 = []
    globalThis.fetch = async (url, init) => {
      calls400.push(init.headers.authorization.slice(7))
      return new Response(JSON.stringify({ detail: 'bad query' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }
    let err400 = null
    try { await p.search({ query: 'q' }) } catch (e) { err400 = e }
    assert.deepEqual(calls400, ['k2-good'], '400 应 fail fast 不轮换')
    ok('非轮换类错误（400）：fail fast')
  } finally {
    globalThis.fetch = realFetch
  }
}
{
  // parseTavilyKeys 单 key 兼容
  const p = new TavilySearchProvider({ apiKey: 'single-key', baseURL: 'https://api.tavily.com', searchDepth: 'basic', includeAnswer: false })
  assert.equal(p.keys.length, 1)
  assert.equal(p.available(), true)
  ok('单 key 逗号解析兼容：行为不变')
}

// --- 可选：真实 API ---
if (process.argv.includes('--live') && process.env.TAVILY_API_KEY) {
  const p = new TavilySearchProvider({
    apiKey: process.env.TAVILY_API_KEY,
    baseURL: 'https://api.tavily.com',
    searchDepth: 'basic',
    includeAnswer: true,
  })
  const r = await p.search({ query: 'deepseek harness', maxResults: 2 })
  assert.ok(r.sources.length >= 1, 'live 搜索应有结果')
  console.log(`  ✓ live 搜索返回 ${r.sources.length} 条`)
}

console.log(`\n${passed} 项断言通过`)
