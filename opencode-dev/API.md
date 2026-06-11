## 10. TUI Control API

```typescript
sdk.client.tui.appendPrompt({ body: { text } })      // append text to input
sdk.client.tui.submitPrompt()                         // submit input
sdk.client.tui.clearPrompt()                          // clear input
sdk.client.tui.executeCommand({ body: { command } }) // run command
sdk.client.tui.showToast({ body: { message, variant, title?, duration? } })
sdk.client.tui.openHelp()
sdk.client.tui.openSessions()
sdk.client.tui.openThemes()
sdk.client.tui.openModels()
sdk.client.tui.publish({ body: EventTui... })          // publish TUI event
sdk.client.tui.control.next()                          // dequeue control
sdk.client.tui.control.response({ body })              // respond to control
```

---

## 11. File, Find, MCP, PTY, VCS, LSP

### File
```typescript
sdk.client.file.read({ query: { path, directory? } })     // → FileContent
sdk.client.file.list({ query: { path, directory? } })     // → FileNode[]
sdk.client.file.status({ query: { directory? } })         // → File[]
```

### Find (search)
```typescript
sdk.client.find.text({ query: { pattern, directory? } })       // → text matches
sdk.client.find.files({ query: { query, directory?, dirs? } }) // → string[]
sdk.client.find.symbols({ query: { query, directory? } })      // → Symbol[]
```

### MCP
```typescript
sdk.client.mcp.status()                                    // → { [name]: McpStatus }
sdk.client.mcp.add({ body: { name, config } })             // → McpStatus
sdk.client.mcp.connect({ path: { name } })                 // → boolean
sdk.client.mcp.disconnect({ path: { name } })              // → boolean
sdk.client.mcp.auth.authenticate({ path: { name } })       // → opens browser
```

### PTY
```typescript
sdk.client.pty.list()                                       // → Pty[]
sdk.client.pty.create({ body: { command?, args?, cwd?, title?, env? } })
sdk.client.pty.get/update/remove({ path: { id } })
```

### VCS
```typescript
sdk.client.vcs.get()                                       // → VcsInfo
```

### LSP
```typescript
sdk.client.lsp.status()                                    // → LspStatus[]
```

---

## 12. Console / Account / Org

```typescript
sdk.client.experimental.console.listOrgs()     // list organizations
sdk.client.experimental.console.switchOrg()    // switch org
sdk.client.experimental.console.get()          // console state

type ConsoleState = {
  consoleManagedProviders: string[]
  activeOrgName?: string
  switchableOrgCount: number
}
```

### Account API (OpenAPI)
`/api/account` — GET/POST/DELETE
`/api/account/{accountID}` — GET/PATCH
`/api/account/{accountID}/auth` — GET/POST/DELETE
`/api/account/{accountID}/orgs` — GET
`/api/account/{accountID}/verify/{providerID}` — GET/POST
Auth stored per-account: `ApiKeyCredential | OAuthCredential | WellKnownAuth`

---

## 13. OpenAPI Endpoint Reference (Complete)

> Endpoints last verified against opencode v1.7.1

### Session Group
| Method | Path | SDK Method | Purpose |
|--------|------|-----------|---------|
| GET | `/session` | `session.list()` | List sessions |
| POST | `/session` | `session.create()` | Create session |
| GET | `/session/{id}` | `session.get()` | Get session |
| PATCH | `/session/{id}` | `session.update()` | Update session |
| DELETE | `/session/{id}` | `session.delete()` | Delete session |
| POST | `/session/{id}/prompt_async` | `session.promptAsync()` | Prompt without waiting |
| POST | `/session/{id}/command` | `session.command()` | Execute command |
| POST | `/session/{id}/shell` | `session.shell()` | Shell command |
| POST | `/session/{id}/abort` | `session.abort()` | Abort generation |
| POST | `/session/{id}/fork` | `session.fork()` | Fork session |
| POST | `/session/{id}/revert` | `session.revert()` | Undo message |
| POST | `/session/{id}/unrevert` | `session.unrevert()` | Redo message |
| POST | `/session/{id}/share` | `session.share()` | Share session |
| DELETE | `/session/{id}/share` | `session.unshare()` | Unshare session |
| POST | `/session/{id}/summarize` | `session.summarize()` | Summarize session |
| POST | `/session/{id}/init` | `session.init()` | Init project |
| GET | `/session/{id}/message` | `session.messages()` | List messages |
| POST | `/session/{id}/message` | `session.prompt()` | Send message |
| GET | `/session/{id}/message/{msgId}` | `session.message()` | Get message |
| DELETE | `/session/{id}/message/{msgId}` | `session.deleteMessage()` | Delete message |
| PATCH | `/session/{id}/message/{msgId}/part/{partID}` | `part.update()` | Update part |
| DELETE | `/session/{id}/message/{msgId}/part/{partID}` | `part.delete()` | Delete part |
| POST | `/session/{id}/permissions/{permID}` | `permission.reply()` | Reply permission |
| GET | `/session/{id}/todo` | `session.todo()` | Get todos |
| GET | `/session/{id}/diff` | `session.diff()` | Get diff |
| GET | `/session/{id}/children` | `session.children()` | Get child sessions |
| POST | `/session/{id}/permission/{id}/reply` | `permission.reply()` | Reply (v2) |
| POST | `/session/{id}/question/{id}/reply` | `question.reply()` | Answer question |
| POST | `/session/{id}/question/{id}/reject` | `question.reject()` | Reject question |
| POST | `/api/session/{id}/compact` | — | Compact session |
| GET | `/api/session/{id}/context` | — | Active context |
| POST | `/api/session/{id}/wait` | — | Wait for idle |
| POST | `/api/session/{id}/prompt` | — | Prompt (v2) |
| GET | `/api/session` | — | List sessions (v2) |

### Other Key Endpoints
| Method | Path | SDK Method | Purpose |
|--------|------|-----------|---------|
| GET | `/global/event` | `global.event()` | SSE event stream |
| GET | `/global/health` | `global.health()` | Health check |
| GET | `/global/config` | `global.config.get()` | Global config |
| PATCH | `/global/config` | `global.config.update()` | Update config |
| POST | `/global/dispose` | `global.dispose()` | Dispose instance |
| PUT | `/auth/{providerID}` | `auth.set()` | Set API key |
| DELETE | `/auth/{providerID}` | `auth.remove()` | Remove API key |
| GET | `/api/event` | `event.subscribe()` | SSE (v2) |
| GET | `/api/permission` | `permission.list()` | List permissions |
| GET | `/question` | `question.list()` | Question SSE stream |
| POST | `/question/{id}/reply` | `question.reply()` | Answer ques (v1) |
| POST | `/question/{id}/reject` | `question.reject()` | Reject ques (v1) |
| GET | `/tui/control/next` | `tui.control.next()` | Dequeue TUI control |
| POST | `/tui/control/response` | `tui.control.response()` | Respond TUI control |
| POST | `/sync/start` | `sync.start()` | Start multi-device sync |

---

## 14. SDK Usage Rules

### Client Creation
```typescript
// Preferred for external consumers:
import { createOpencodeClient } from "@opencode-ai/sdk/client"
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  // fetch override: timeouts disabled by default
  // headers: custom headers (auto-sets x-opencode-directory)
})

// Full server + client:
import { createOpencode } from "@opencode-ai/sdk"
const { client, server } = await createOpencode({ hostname, port, signal, timeout, config })
server.close()

// Always use raw fetch for simple calls when SDK types are too complex.
```

### Request/Response Pattern
```typescript
// All SDK methods return { data?: T, error?: ErrorType }
// Use throwOnError: true to get direct T
const result = await sdk.client.session.prompt({
  sessionID: "ses_xxx",
  prompt: { text: "hello" },
  // delivery?: "steer" | "queue"
  // resume?: boolean
})

// SSE subscription
const events = await sdk.client.event.subscribe()
for await (const event of events.stream) {
  console.log(event.type, event.properties)
}
```

### Structured Output
```typescript
sdk.client.session.prompt({
  sessionID: "ses_xxx",
  prompt: { text: "Return JSON" },
  format: { type: "json_schema", schema: { /* JSON Schema */ }, retryCount: 2 },
})
// result.data.info.structured_output → parsed JSON
```

### Error Types
`ProviderAuthError`, `UnknownError`, `MessageOutputLengthError`, `MessageAbortedError`,
`APIError` (has statusCode, responseHeaders, responseBody, isRetryable),
`BadRequestError` (400), `NotFoundError` (404), `StructuredOutputError`
