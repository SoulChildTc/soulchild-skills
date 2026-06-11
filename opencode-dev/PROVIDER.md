## 6. Project & Provider System

### Project
```typescript
sdk.client.project.list()              // → Project[]
sdk.client.project.current()           // → Project
sdk.client.project.initGit({ id })     // init git in project

type Project = { id, worktree, vcsDir?, vcs?: "git", time: { created, initialized? } }
```

### Provider & Model
```typescript
sdk.client.provider.list()             // → { all: Provider[], default: {...}, connected: string[] }
sdk.client.config.providers()          // → { providers: Provider[], default: {...} }
sdk.client.config.get()                // → Config
sdk.client.config.update(body?)        // → Config

type Provider = {
  id: string; name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]; key?: string
  options: { [key: string]: unknown }
  models: { [modelID: string]: Model }
}

type Model = {
  id: string; providerID: string; name: string; family?: string
  capabilities: { temperature: boolean; reasoning: boolean; attachment: boolean; toolcall: boolean
    input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean }
    output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean } }
  cost: { input: number; output: number; cache: { read: number; write: number } }
  limit: { context: number; input?: number; output: number }
  status: "alpha" | "beta" | "deprecated" | "active"
  variants?: { [key: string]: { [key: string]: unknown } }
}
```

### Auth
```typescript
// Set API key
sdk.client.auth.set({ path: { id: "anthropic" }, body: { type: "api", key: "sk-..." } })
// Auth types: OAuth | ApiAuth({ type: "api", key, metadata? }) | WellKnownAuth({ type: "wellknown", key, token })

// OAuth flow
sdk.client.provider.oauth.authorize({ path: { id: "providerID" }, body: { method } })
  // → { url, method: "auto"|"code", instructions }
sdk.client.provider.oauth.callback({ path: { id: "providerID" }, body: { method, code? } })
```

---

## 8. Agent System

```typescript
// SDK
sdk.client.app.agents()   // → Agent[]

type Agent = {
  name: string; description?: string
  mode: "subagent" | "primary" | "all"
  builtIn: boolean
  topP?: number; temperature?: number
  color?: string; permission?: {...}
  model?: {...}; prompt?: string
  tools: { [key: string]: boolean }
  options: {...}; maxSteps?: number
}
```

### Agent Store (TUI — `local.tsx`)
```typescript
agent: {
  list()            // visible agents (not subagent mode)
  current()         // current agent
  set(name)         // switch agent
  move(dir)         // cycle agent
  color(name)       // agent color
}
```
