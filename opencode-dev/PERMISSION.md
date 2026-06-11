## 4. Permission (Approval) Flow

### Permission Request Data Model
```typescript
type PermissionRequest = {
  id: string
  sessionID: string
  permission: string  // "edit" | "read" | "glob" | "grep" | "bash" | "task" | "webfetch" | "websearch" | "external_directory" | "doom_loop"
  patterns: string[]
  metadata: { [key: string]: unknown }
  always: string[]
  tool?: { messageID: string; callID: string }
}
```

### Event Flow
```
SSE "permission.asked"  →  SyncProvider inserts into store.permission[sessionID]
                            (binary search → reconcile)
PermissionPrompt renders → user picks action
SSE "permission.replied" → removed from store
```

### SDK — Reply to Permission
```typescript
// Allow once
await sdk.client.permission.reply({
  reply: "once",
  requestID: "req_id",
  directory: "/path",
  workspace: "ws_id",
})

// Allow always
await sdk.client.permission.reply({
  reply: "always",
  requestID: "req_id",
  directory: "/path",
  workspace: "ws_id",
})

// Reject (with optional reason)
await sdk.client.permission.reply({
  reply: "reject",
  requestID: "req_id",
  directory: "/path",
  message: "reason for rejection",  // optional
  workspace: "ws_id",
})
```

Server endpoint: `POST /api/session/:sessionID/permission/:requestID/reply`
Alternative endpoint (v1 SDK): `client.postSessionIdPermissionsPermissionId({ path: { id, permissionID }, body: { response: "once"|"always"|"reject" } })`

### Permission PermissionPrompt Component (TUI)
`packages/tui/src/routes/session/permission.tsx`

Three sub-stages:
1. **permission** — main: show description + 3 buttons (Once / Always / Reject)
2. **always** — confirm "always allow" sub-interface
3. **reject** — input rejection reason (subagent sessions only)

Permission type specific displays:
- `edit` → file diff (`<diff>` component)
- `read` → file path
- `bash` → shell command
- `task` → sub-task description
- `webfetch` → URL
- `websearch` → search query
- `glob` / `grep` → patterns
- `external_directory` → external dir + patterns
- `doom_loop` → "continuing after repeated failures"

### Store Structure
```typescript
permission: { [sessionID: string]: PermissionRequest[] }
message limit: 100 (oldest messages + parts pruned)
```

---

## 5. Question Dialog Flow

### Question Data Model
```typescript
type QuestionRequest = {
  id: string            // prefix "que"
  sessionID: string     // prefix "ses"
  questions: QuestionInfo[]
  tool?: QuestionTool
}

type QuestionInfo = {
  question: string
  header: string          // <30 chars label
  options: QuestionOption[]
  multiple?: boolean      // allow multi-select
  custom?: boolean        // allow custom text input
}

type QuestionOption = {
  label: string
  description: string
}
```

### SDK — Reply to Question
```typescript
// Answer
sdk.client.question.reply({
  requestID: "que_xxx",
  directory: "/path",
  answers: [["option1"], ["custom answer"]],  // one array per question
})

// Reject
sdk.client.question.reject({
  requestID: "que_xxx",
  directory: "/path",
})
```

### Store Structure
```typescript
question: { [sessionID: string]: QuestionRequest[] }
```
