---
name: opencode-dev
description: >
  Universal Open Code development skill. Use whenever the user asks to build,
  modify, debug, or understand any feature of the Open Code TUI (desktop or
  CLI). Covers session management, message streaming, permission approval,
  question dialogs, project management, provider/model
  config, SSE event handling, account/org management, MCP, VCS, file ops,
  and the full SDK/OpenAPI surface. ALSO use when the user asks about code
  structure, data flow, or how any part of Open Code works — this skill
  contains the complete "answer key" so you don't need to re-research.
  Trigger on phrases like "opencode feature", "TUI component", "build a
  session view", "approval flow", "SDK API", "opencode integration",
  "add a new API endpoint", "how does X work in opencode".
allowed-tools: Read, Grep, Bash, WebFetch
---

# Open Code Dev Skill

> Based on opencode v1.7.1

## Architecture Overview

```
opencode/                  ← REFERENCE CODEBASE (https://github.com/opencode-ai/opencode)
├── packages/tui/src/     TUI core (Solid.js + @opentui)
├── packages/sdk/js/src/  SDK v1 + v2 clients
├── packages/server/src/  Express + Effect HttpApi server
└── packages/opencode/    CLI + core logic
```

### Tech Stack
| Layer | Tech |
|-------|------|
| TUI | Solid.js + `@opentui/solid` + `@opentui/core` |
| State | `solid-js/store` (createStore, produce, reconcile) |
| Events | SSE (Server-Sent Events) + local EventEmitter |
| HTTP Client | `@hey-api/openapi-ts` generated client |
| Server | Effect `HttpApi` (declarative HTTP API framework) |
| SDK types | `@opencode-ai/sdk` v1 in `dist/gen/types.gen.d.ts` |
| Build | Turborepo monorepo |

### Provider Tree (from outermost to innermost)
```
ExitProvider → EpilogueProvider → ErrorBoundary → TuiPathsProvider
→ TuiTerminalEnvironmentProvider → TuiStartupProvider → ClipboardProvider
→ OpencodeKeymapProvider → ArgsProvider → KVProvider → ToastProvider
→ RouteProvider → TuiConfigProvider → PluginRuntimeProvider
→ SDKProvider → ProjectProvider → SyncProvider (V1 events)
→ SyncProviderV2 (V2 events) → ThemeProvider → LocalProvider
→ PromptStashProvider → DialogProvider → FrecencyProvider
→ PromptHistoryProvider → PromptRefProvider → EditorContextProvider → <App />
```

---

## 1. Initialization Flow

### Entry Point
`packages/tui/src/app.tsx` — `run()` (Effect function):
```typescript
export const run = Effect.fn("Tui.run")(function* (input: TuiInput) {
  // input.url      — server base URL
  // input.args     — CLI args
  // input.config   — TuiConfig.Resolved
  // input.fetch    — custom fetch
  // input.headers  — custom headers
  // input.events   — EventSource
  // input.pluginHost — TuiPluginHost
})
```

### Bootstrap (SyncProvider) — `packages/tui/src/context/sync.tsx`
**Blocking** (UI waits):
- `sdk.client.config.providers()` → provider[]
- `sdk.client.provider.list()` → provider_next
- `sdk.client.app.agents()` → agent[]
- `sdk.client.config.get()` → config
- `project.sync()` → project info
- If `-c` mode: `session.list()`

**Non-blocking** (background):
- `session.list()`, `command.list()`, `lsp.status()`, `mcp.status()`
- `formatter.status()`, `session.status()`, `provider.auth()`, `vcs.get()`

Status flow: `"loading"` → `"partial"` → `"complete"`

### SDK Connection (SDKProvider) — `packages/tui/src/context/sdk.tsx`
1. `createOpencodeClient({ baseUrl })` creates HTTP client
2. SSE starts via `sdk.global.event()` — infinite stream with exponential backoff reconnect (1s → 30s max)
3. Events batched in 16ms window, then single `batch()` render

## Module Loader

This skill is split into modular files for on-demand loading. Read the relevant file based on what the user needs:

| If the user asks about... | Load this file |
|---|---|
| Session data model, SDK methods, sync, status, routes, keyboard commands | `SESSION.md` |
| Message types, parts, tool state machine, tool→render mapping, V2 event stream | `SESSION.md` |
| Permission approval flow, SDK reply, PermissionPrompt UI | `PERMISSION.md` |
| Question dialog flow, SDK reply/reject, store structure | `PERMISSION.md` |
| Project, provider & model types, auth (API key, OAuth) | `PROVIDER.md` |
| Agent system, agent store | `PROVIDER.md` |
| Sync store full structure, event update pattern, local store | `SYNC.md` |
| SSE event catalog (V1 + V2) | `SYNC.md` |
| TUI control API (appendPrompt, showToast, etc.) | `API.md` |
| File, Find, MCP, PTY, VCS, LSP SDK methods | `API.md` |
| Console, account, org management | `API.md` |
| OpenAPI endpoint reference | `API.md` |
| SDK client creation, request/response, structured output, error types | `API.md` |
| Key TUI file index | `INDEX.md` |
| Behavioral guidelines for implementation | `INDEX.md` |