# dsh-web-search-tavily

DeepSeek Harness（DSH）插件：**把 `web_search` 的搜索后端从 DeepSeek 云换成
[Tavily](https://tavily.com) API**。

- **省配额**：DSH 默认的 `deepseek-official` 搜索后端每次搜索 = 一次完整模型调用
  （烧 DeepSeek API 配额）；换 Tavily 后走 Tavily 独立配额（免费 1000 次/月）。
- **多 key 轮换**：`apiKey` 支持逗号分隔多个 key（Hermes 同款 sticky 行为）——
  401/403/429/5xx 自动切下一个 key，成功后粘住；400 等坏请求 fail fast。
- **零侵入**：走 `ctx.web` 官方 provider seam（`registerSearchProvider`），
  不改动 DSH 任何上游文件；与官方 `dsh-web-search-exa` / `perplexity` 同一模式。
- **密钥不落盘**：`apiKey` 支持 `env:VAR` 引用，兜底读启动环境 `$TAVILY_API_KEY`。

---

## English Summary

**dsh-web-search-tavily** replaces the DeepSeek Harness `web_search` backend with
the [Tavily Search API](https://tavily.com) — search stops costing a DeepSeek
cloud model call per query (Tavily free tier: 1000 credits/month).

**Features**

- **Provider seam**: registers a `tavily` search provider via `ctx.web` —
  no upstream DSH files modified (same pattern as the official
  `dsh-web-search-exa` / `perplexity` providers).
- **Multi-key rotation**: comma-separated `apiKey` values; sticky-first order,
  rotate on 401/403/429/5xx and transport errors, fail fast on 400s.
- **Config**: `apiKey` (`env:VAR` supported, falls back to `$TAVILY_API_KEY`),
  `baseURL`, `searchDepth` (`basic`/`advanced`), `maxResults`, `includeAnswer`.
- **Cancel-safe**: `AbortSignal` mapped to `WEB_ABORTED`; redirects and
  non-JSON error bodies surface as proper `WebError`s.

**Install**

```bash
# Git channel (repo root is the plugin)
dsh plugin --profile <name> add "github:zyfgood/dsh-web-search-tavily#main&path:/"
```

Set `TAVILY_API_KEY` in the launch environment (e.g. `~/.dsh/.env`), restart
`dsh web`, and `web_search` returns Tavily results. Manual mounting and every
config option: see the Chinese sections below.

**License**: MIT.

---

## 机制

DSH 的 web 能力是 provider seam（`ctx.web.registerSearchProvider`）。本插件注册
一个 `tavily` provider（`POST /search`，Bearer key），再把 web 行的
`searchProvider` 切到 `tavily`：

```
web_search 工具 (dsh-tool-web)
  → ctx.web.search()              # provider 可插拔 seam
  → searchProvider: tavily        # 本插件（原来是 deepseek-official）
```

字段映射：Tavily `results[].content` → `snippet`，`published_date` → `publishedAt`，
`score` 不可移植丢弃；可选的 `answer`（`includeAnswer: true`）→ 结果 `content`。
无 URL 或既无内容又无标题的脏结果直接丢弃。

## 安装

### 方式一：官方 CLI 一条命令安装（推荐）

```bash
# 安装前设置密钥环境变量（也可装后再设，重启前配置好即可）
export TAVILY_API_KEY=tvly-xxx      # Windows: 写入 %USERPROFILE%/.dsh/.env

dsh plugin --profile <name> add "github:zyfgood/dsh-web-search-tavily#main&path:/"
# 或 npm 渠道（发布后可用）：dsh plugin --profile <name> add dsh-web-search-tavily
```

包内自带 `cordis.patch.yml`（`dsh.bundle.patch`），CLI 安装时自动挂载：插入插件行
并把 web 行切到 `searchProvider: tavily`，无需手工编辑配置文件。装完重启
`dsh web` 生效。

### 方式二：手工挂载（适用于任何托管位置）

1. profile `package.json`：
   ```json
   "dependencies": { "dsh-web-search-tavily": "file:/path/to/dsh-web-search-tavily" },
   "dsh": { "profile": { "bundles": [ "...", "dsh-web-search-tavily" ] } }
   ```
2. `%USERPROFILE%/.dsh/.env` 加 `TAVILY_API_KEY=tvly-xxx`（loadLayeredEnv 启动注入）
3. profile `cordis.patch.yml`（完整示例见 `cordis.patch.example.yml`）：
   ```yaml
   - insert:
       - id: web-search-tavily
         name: dsh-web-search-tavily
         config:
           apiKey: 'env:TAVILY_API_KEY'
   - id: web
     name: '@deepseek-ai/dsh-web'
     config:
       searchProvider: tavily
       fetchProvider: http
   ```
   （⚠️ `- id: web` 的 `config` 是整键替换：覆盖必须同时带 `fetchProvider: http`，
   否则 web_fetch 丢失。）

## 配置项

| 配置项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `apiKey` | string | `$TAVILY_API_KEY` 兜底 | 支持 `env:VAR` 引用；逗号分隔多 key 轮换；空 → provider 不可用 |
| `baseURL` | string | `https://api.tavily.com` | 可换自建网关（`/search` 自动拼接） |
| `searchDepth` | `basic` \| `advanced` | `basic` | `advanced` = 重排序，2 credits/次 |
| `maxResults` | number | Tavily 默认 | 请求未带 `maxResults` 时的默认条数 |
| `includeAnswer` | boolean | `false` | 是否要 Tavily 生成答案（映射到结果 `content`） |

## 验证要点

- 启动日志无 `web-search-tavily` 相关 warning / `did not activate`
- 会话事件里不再出现 `web/deepseek-search-llm-request`
- `web_search` 工具返回 Tavily 结果（标题/snippet/日期为 Tavily 口径）

## 常见问题

- **搜索报 `WEB_PROVIDER_UNAVAILABLE`**：`TAVILY_API_KEY` 未设置或 `apiKey` 为空
  （`env:VAR` 引用的变量未设置时插件会直接报错指明变量名）。
- **`WEB_PROVIDER_AMBIGUOUS`**：web 行没固定 `searchProvider` 且同时有多个可用
  provider —— 确认 `- id: web` 覆盖行存在且带 `searchProvider: tavily`。
- **`invalid key` / HTTP 401**：key 无效；配了多 key 会自动轮换，全部失效才报错。
- **想切回 DeepSeek 官方搜索**：把 web 行的 `searchProvider` 改回
  `deepseek-official`（或删掉本插件覆盖行恢复 base bundle 默认）。

## 开发与构建

```bash
npm install --legacy-peer-deps   # 安装依赖（@deepseek-ai/* 由 DSH 运行期提供，这里仅用于类型检查）
npm run build                    # tsc → lib/
npm test                         # 冒烟测试（mock，不打网络）
TAVILY_API_KEY=xxx npm test -- --live   # 真实 API 验证（可选）
```

> 仓库中的 `lib/` 为已构建产物（开箱即用）；修改 `src/` 后运行 `npm run build`
> 重新生成。编译期类型依赖（`@deepseek-ai/dsh-web` 等 peer 包）通过仓库 checkout
> 的 node_modules 解析（dev junction）；运行时由 DSH loader 的
> installation-scope 解析，无需 profile node_modules 里有这些包。

源码结构：

- `src/index.ts` — 插件入口（Config 校验、`env:VAR` 密钥解析、provider 注册）
- `src/provider.ts` — `TavilySearchProvider`（多 key sticky 轮换、错误映射、取消）
- `src/types.ts` — Tavily wire 类型（仅本 provider 读取的字段）
- `tests/smoke.mjs` — 冒烟测试（`npm test`）
- `cordis.patch.example.yml` — profile patch 配置示例

## License

MIT
