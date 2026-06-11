## 2. Session Management

### Session Data Model
```typescript
type Session = {
  id: string             // prefix "ses"
  slug: string
  projectID: string
  workspaceID?: string
  directory: string
  path?: string
  parentID?: string       // subagent sessions link to parent
  summary?: { additions: number; deletions: number; files: number; diffs?: SnapshotFileDiff[] }
  cost?: number
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  share?: { url: string }
  title: string
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  version: string
  metadata?: { [key: string]: unknown }
  time: { created: number; updated: number; compacting?: number; archived?: number }
  permission?: PermissionRuleset
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string }
}
```

### Key SDK Session Methods
```typescript
// CRUD
sdk.client.session.list()                              // GET /session → Session[]
sdk.client.session.get({ sessionID })                  // GET /session/:id → Session
sdk.client.session.create({ title, permission? })      // POST /session → Session
sdk.client.session.update({ sessionID, body: { title } }) // PATCH /session/:id
sdk.client.session.delete({ sessionID })               // DELETE /session/:id

// Messages
sdk.client.session.prompt({ sessionID, prompt: { text, files?, agents? }, model?, agent?, delivery?, resume? })
  // POST /session/:id/prompt → { data: SessionInput.Admitted }
  // prompt: { text: string, files?: FilePartInput[], agents?: string[] }
  // delivery?: "steer" | "queue"
  // resume?: boolean — resume agent loop
  // Returns immediately; response streams via SSE

sdk.client.session.messages({ sessionID, query: { limit? } })
  // GET /session/:id/message → Array<{ info: Message, parts: Part[] }>

sdk.client.session.message({ sessionID, messageID })
  // GET /session/:id/message/:msgId → { info: Message, parts: Part[] }

// Commands & Shell
sdk.client.session.command({ sessionID, body: { command, arguments, agent?, model?, messageID? } })
sdk.client.session.shell({ sessionID, body: { command, agent, model? } })

// Operations
sdk.client.session.fork({ sessionID, body: { messageID? } })   // POST → new Session
sdk.client.session.revert({ sessionID, body: { messageID, partID? } })
sdk.client.session.unrevert({ sessionID })
sdk.client.session.abort({ sessionID })                         // POST
sdk.client.session.share({ sessionID })                         // POST → Session
sdk.client.session.unshare({ sessionID })                       // DELETE
sdk.client.session.summarize({ sessionID, body: { providerID, modelID } })
sdk.client.session.init({ sessionID, body: { modelID, providerID, messageID } })
  // POST /session/:id/init — analyzes project, creates AGENTS.md

// Diff & Todo
sdk.client.session.diff({ sessionID, query: { messageID? } })   // GET → FileDiff[]
sdk.client.session.todo({ sessionID })                           // GET → Todo[]

// Children (subagent sessions)
sdk.client.session.children({ sessionID })                      // GET → Session[]
```

### Session Sync (TUI) — `sync.tsx`
```typescript
sync.session.sync(sessionID):  // called on navigation
  // 1. GET /session/:id         → session detail
  // 2. GET /session/:id/message?limit=100  → messages
  // 3. GET /session/:id/todo    → todos
  // 4. GET /session/:id/diff    → diffs
  //   → merge into createStore with reconcile/produce
```

### Session Status
```typescript
type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; action?: {...}; next: number }
  | { type: "busy" }
```
Computed from last message's `role` and `completed` time.

### Route
```typescript
type Route =
  | { type: "home"; prompt?: PromptInfo }
  | { type: "session"; sessionID: string; prompt?: PromptInfo }
  | { type: "plugin"; id: string; data?: Record<string, unknown> }
```
Navigate: `route.navigate({ type: "session", sessionID })` — auto-triggers `sync.session.sync(id)` via `createEffect`.

### Session Commands (keyboard)
`session.share/unshare`, `session.rename`, `session.timeline`, `session.fork`, `session.compact`, `session.undo/redo`, `session.export`, navigation: `session.first/last/message.next/message.previous`, subagent: `session.child.first/parent/next/previous`

---

## 3. Message System

### Message Types
```typescript
type Message = UserMessage | AssistantMessage

type UserMessage = {
  id: string; sessionID: string; role: "user"
  time: { created: number }
  format?: OutputFormat
  summary?: { title?: string; body?: string; diffs: SnapshotFileDiff[] }
  agent: string; model: { providerID: string; modelID: string; variant?: string }
  system?: string; tools?: { [key: string]: boolean }
}

type AssistantMessage = {
  id: string; sessionID: string; role: "assistant"
  time: { created: number; completed?: number }
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError
  parentID: string; modelID: string; providerID: string; mode: string
  agent: string; path: { cwd: string; root: string }
  summary?: boolean; cost: number
  tokens: { total?: number; input: number; output: number; reasoning?: number; cache: { read: number; write: number } }
  structured?: unknown; variant?: string; finish?: string
}
```

### Part Types
```typescript
type Part =
  | { type: "text"; text: string; synthetic?: boolean; ignored?: boolean }
  | { type: "subtask"; prompt: string; description: string; agent: string }
  | { type: "reasoning"; text: string; time: { start: number; end?: number } }
  | { type: "file"; mime: string; filename?: string; url: string; source?: FilePartSource }
  | { type: "tool"; callID: string; tool: string; state: ToolState }
  | { type: "step-start"; snapshot?: string }
  | { type: "step-finish"; reason: string; snapshot?: string; cost: number; tokens: {...} }
  | { type: "snapshot"; snapshot: string }
  | { type: "patch"; hash: string; files: Array<string> }
  | { type: "agent"; name: string }
  | { type: "retry"; attempt: number; error: ApiError }
  | { type: "compaction"; auto: boolean; overflow?: boolean }
```

### Tool State Machine
```typescript
type ToolState =
  | { status: "pending";   input: Record<string,unknown>; raw: string }
  | { status: "running";   input: Record<string,unknown>; title?: string; metadata?: {...}; time: { start: number } }
  | { status: "completed"; input: Record<string,unknown>; output: string; title: string; metadata: {...}; time: { start: number; end: number; compacted?: number }; attachments?: FilePart[] }
  | { status: "error";     input: Record<string,unknown>; error: string; metadata?: {...}; time: { start: number; end: number } }
```

### Tool → Render Component Mapping (TUI)
In `packages/tui/src/routes/session/index.tsx`:
| tool | Component | Shows |
|------|-----------|-------|
| `bash` | Shell | command + output |
| `glob` | Glob | file pattern |
| `read` | Read | file + loaded list |
| `grep` | Grep | pattern + match count |
| `write` | Write | target + code preview + diagnostics |
| `edit` | Edit | diff (unified/split) |
| `webfetch` | WebFetch | URL |
| `websearch` | WebSearch | query + result count |
| `task` | Task | sub-agent task (clickable) |
| `apply_patch` | ApplyPatch | multi-file patch diff |
| `todowrite` | TodoWrite | TODO list |

### V2 Event Stream (real-time message updates)
Ordered event sequence for message rendering:
```
session.next.prompted           → user message created
session.next.prompt.promoted    → user message promoted
session.next.step.started       → assistant message created (content: [])
session.next.text.started       → push text part
session.next.text.delta         → append text
session.next.text.ended         → final text
session.next.reasoning.started  → push reasoning part
session.next.reasoning.delta    → append reasoning
session.next.reasoning.ended    → final reasoning
session.next.tool.input.started → push tool (pending)
session.next.tool.input.delta   → append tool input
session.next.tool.called        → tool → running
session.next.tool.progress      → update progress
session.next.tool.success       → tool → completed
session.next.tool.failed        → tool → error
session.next.step.ended         → assistant done
session.next.shell.started      → shell msg
session.next.shell.ended        → shell output
```
