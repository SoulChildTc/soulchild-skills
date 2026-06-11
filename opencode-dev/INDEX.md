## 15. Key TUI File Index

| Module | File Path | Key Export |
|--------|-----------|------------|
| Entry | `packages/tui/src/app.tsx` | `run()`, `TuiInput`, `App` |
| Entry (re-export) | `packages/tui/src/index.tsx` | `{ run, TuiInput }` |
| SDK context | `packages/tui/src/context/sdk.tsx` | `useSDK`, `SDKProvider` |
| Sync V1 | `packages/tui/src/context/sync.tsx` | `useSync`, `SyncProvider` |
| Sync V2 | `packages/tui/src/context/sync-v2.tsx` | `useSyncV2`, `SyncProviderV2` |
| Local state | `packages/tui/src/context/local.tsx` | `useLocal`, `LocalProvider` |
| Route | `packages/tui/src/context/route.tsx` | `useRoute`, `RouteProvider` |
| Project | `packages/tui/src/context/project.tsx` | `useProject`, `ProjectProvider` |
| Event | `packages/tui/src/context/event.ts` | `useEvent()` |
| Theme | `packages/tui/src/context/theme.tsx` | `useTheme`, `ThemeProvider` |
| Session view | `packages/tui/src/routes/session/index.tsx` | `Session`, `UserMessage`, `AssistantMessage` |
| Permission UI | `packages/tui/src/routes/session/permission.tsx` | `PermissionPrompt` |
| Question UI | `packages/tui/src/routes/session/question.tsx` | `QuestionPrompt` |
| Sidebar | `packages/tui/src/routes/session/sidebar.tsx` | Session sidebar |
| Prompt input | `packages/tui/src/component/prompt/index.tsx` | `Prompt`, `PromptRef` |
| SDK gen types | `packages/sdk/js/src/v2/gen/types.gen.ts` | ALL API types (10452 lines) |
| SDK gen client | `packages/sdk/js/src/v2/gen/sdk.gen.ts` | `OpencodeClient` (5980 lines) |
| SDK factory (v2) | `packages/sdk/js/src/v2/client.ts` | `createOpencodeClient()` |
| Server sessions | `packages/server/src/groups/session.ts` | Session API group |
| Server messages | `packages/server/src/groups/message.ts` | Message API group |
| Server permissions | `packages/server/src/groups/permission.ts` | Permission API group |

---

## 16. Behavioral Guidelines

1. **Concern separation**: Data fetching in custom hooks (useXxx), presentation in atomic UI components (<100 lines), no API calls inside render functions.

2. **Component atomic**: Each component ≤100 lines. Break complex views into sub-components.

3. **Logic hooks**: Encapsulate all state + side effects into `useXxx()` hooks. Components read from hooks only.

4. **Defensive**: Always check `.data?.field` before access. Wrap API calls in try/catch. Use `throwOnError` only when you handle errors locally. Set sensible defaults.

5. **Type safe**: Import types from `@opencode-ai/sdk` (v1) or match against `types.gen.ts` patterns. Never use `any`.

6. **When implementing new features**: Check TUI source first (`packages/tui/`) for reference implementation, then the SDK gen types (`types.gen.ts`) for the API surface. The TUI has EVERY feature already implemented — match its behavior, don't reinvent.

7. **Event-driven UI**: The entire Open Code UI is event-driven. Follow the SSE subscription → store update → reactive re-render pattern. Do not poll.
