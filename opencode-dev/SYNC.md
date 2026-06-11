## 7. Sync Store — Full Structure

`packages/tui/src/context/sync.tsx`
```typescript
const [store, setStore] = createStore({
  status: "loading" | "partial" | "complete",
  provider: Provider[], provider_default: Record<string, string>,
  provider_next: ProviderListResponse, console_state: ConsoleState,
  provider_auth: Record<string, ProviderAuthMethod[]>,
  agent: Agent[], command: Command[],
  permission: { [sessionID: string]: PermissionRequest[] },
  question: { [sessionID: string]: QuestionRequest[] },
  config: Config,
  session: Session[], session_status: { [sessionID: string]: SessionStatus },
  session_diff: { [sessionID: string]: SnapshotFileDiff[] },
  todo: { [sessionID: string]: Todo[] },
  message: { [sessionID: string]: Message[] },
  part: { [messageID: string]: Part[] },
  lsp: LspStatus[], mcp: { [key: string]: McpStatus },
  mcp_resource: { [key: string]: McpResource },
  formatter: FormatterStatus[], vcs: VcsInfo | undefined,
})
```

### Event Update Pattern
```typescript
event.subscribe((event, { workspace }) => {
  switch (event.type) {
    case "permission.asked":    // binary search insert
    case "message.updated":     // binary search + reconcile
    case "message.part.delta":  // string append to existing part
    case "session.updated":     // upsert session
    case "session.deleted":     // remove from list
    case "session.status":      // direct set
    case "todo.updated":        // replace all todos
    case "session.diff":        // replace all diffs
    // ...
  }
})
```

### Local Store (persisted) — `local.tsx`
```typescript
// model.json: recentModels, favoriteModels, variant selection
// session.json: pinned session IDs
```

---

## 9. SSE Event System — Complete Event Catalog

### V1 Events (SyncProvider)
| Event Type | Description |
|-----------|-------------|
| `session.created/updated/deleted` | Session CRUD |
| `session.status` | busy/idle/retry |
| `session.idle/compacted` | Session lifecycle |
| `session.diff/error` | Session state |
| `message.updated/removed` | Message CRUD |
| `message.part.updated/removed` | Part CRUD |
| `permission.asked/replied` | Permission flow |
| `question.asked/replied/rejected` | Question flow |
| `todo.updated` | Todo update |
| `file.edited` | File edited by agent |
| `file.watcher.updated` | File watcher (add/change/unlink) |
| `lsp.updated` / `lsp.client.diagnostics` | LSP state |
| `vcs.branch.updated` | Git branch change |
| `pty.created/updated/exited/deleted` | PTY lifecycle |
| `tui.prompt.append` / `tui.command.execute` / `tui.toast.show` | TUI control |
| `plugin.added` | Plugin installed |
| `catalog.model.updated` | Model catalog changed |
| `installation.updated/update-available` | Version updates |
| `reference.updated` | Reference updated |
| `models-dev.refreshed` | Dev models refreshed |
| `account.added/removed/switched` | Account management |

### V2 Events (SyncProviderV2) — real-time message streaming
`session.next.prompted`, `session.next.prompt.admitted`, `session.next.prompt.promoted`
`session.next.step.started/ended/failed`
`session.next.text.started/delta/ended`
`session.next.reasoning.started/delta/ended`
`session.next.tool.input.started/delta/ended`
`session.next.tool.called/progress/success/failed`
`session.next.shell.started/ended`
`session.next.agent.switched`, `session.next.model.switched`, `session.next.moved`
`session.next.interrupt.requested`, `session.next.context.updated`, `session.next.synthetic`
`session.next.retried`
`session.next.compaction.started/delta/ended`

### Event Structure
```typescript
type GlobalEvent = { directory: string; payload: Event }
// Every event: { id: string (^evt_), type: string, properties: {...} }
```
