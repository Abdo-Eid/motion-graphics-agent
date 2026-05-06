# Phase 4 — Frontend Integration

## Your Role

Turn the Phase 2 frontend shell into a live surface. The shell renders empty panels today. This task connects every panel to real backend events and real workspace files:

- agent activity events stream into the activity panel
- the file tree shows real sandbox workspace files
- the preview plays the real generated Remotion composition
- users can drag-and-drop uploads into the chat panel
- service connection status is visible

## Scope Decisions

| Decision | Choice |
|---|---|
| Activity transport | SSE (Server-Sent Events) over the existing HTTP server — no extra deps |
| File access from browser | Read-through endpoint on the Mastra server — no direct fs in the browser |
| File-change detection | Watcher in the Mastra app, change events emitted onto the same SSE stream |
| Preview reload | Re-mount the Remotion Player when the composition entry file changes |

## Where To Work

```text
mastra/src/mastra/server/
  events.ts               # SSE route + in-process event bus
  workspace-files.ts      # GET /workspace/files, GET /workspace/file
  watcher.ts              # fs watcher emitting change events to the bus

web/src/
  lib/events.ts           # SSE client hook
  lib/workspace-api.ts    # workspace fetch helpers
  components/activity-panel.tsx     # rewrite
  components/file-tree-panel.tsx    # rewrite
  components/code-viewer.tsx        # new
  components/player-panel.tsx       # rewrite
  components/upload-dropzone.tsx    # new
  components/connection-status.tsx  # new
```

## Part A — Activity Stream

### Event Schema

```ts
type ActivityEvent =
  | { type: 'agent.start';    agent: AgentId; sceneNumber?: number; ts: number }
  | { type: 'agent.message';  agent: AgentId; text: string; ts: number }
  | { type: 'agent.tool';     agent: AgentId; tool: string; ts: number }
  | { type: 'agent.end';      agent: AgentId; sceneNumber?: number; ts: number }
  | { type: 'agent.error';    agent: AgentId; error: string; ts: number }
  | { type: 'workspace.file'; path: string; change: 'add' | 'change' | 'unlink'; ts: number }
  | { type: 'upload.status';  assetId: string; status: IngestStatus; ts: number }
  | { type: 'service.health'; service: 'mastra' | 'sandbox'; ok: boolean; ts: number }

type AgentId = 'planner' | 'art-director' | 'implementor'
```

### Server Side

- In-process event bus (`EventEmitter` is fine for MVP).
- SSE route: `GET /events/:projectId` — opens a long-lived response, writes `data: {json}\n\n` per event, sends a heartbeat comment every 15 s.
- The Planner's `delegation` hooks emit `agent.start` / `agent.end` / `agent.error` (with `sceneNumber` when the dispatch was per-scene).
- Upload pipeline emits `upload.status` events.
- Watcher emits `workspace.file` events under `<sandboxRoot>/src/` (the resolved `sandboxRoot`). The `workspace.file` event name is the bus event taxonomy name and is preserved as-is — see [Part A](#part-a--connection-and-event-taxonomy) for the canonical taxonomy.
- The frontend reconstructs per-scene status from the `agent.start` / `agent.end` payloads (which carry `sceneNumber`) plus filesystem signals — there is no dedicated `scene.update` event.
- Health pings emit `service.health` for `mastra` and `sandbox` (the sandbox health is observed by the MCP client; success = `ok: true`).

### Client Side

```ts
// web/src/lib/events.ts
export function useActivityStream(projectId: string): {
  events: ActivityEvent[]
  connection: 'connecting' | 'open' | 'closed'
}
```

The activity panel renders three lanes (Planner / Art Director / Implementor) plus a system lane for service health and uploads. Each lane is a simple time-ordered list. Color: idle gray, active accent, error red.

## Part B — File Tree + Code Viewer

### Endpoints

```
GET /workspace/files?path=<rel>      -> [{ name, kind: 'file' | 'dir' }]
GET /workspace/file?path=<rel>       -> { content: string, mime: string }
```

Both resolve through the same path-guard the sandbox service uses — no escapes outside the sandbox root. The Mastra server reads the sandbox root directly via `mastra/src/mastra/sandbox-root.ts` (file-anchored to `<repo>/sandbox/.workspace` by default; `WORKSPACE_PATH` overrides). Both services compute the same path. (This is the sandbox filesystem root, not `@mastra/core/workspace`.)

### Frontend

- `file-tree-panel.tsx` fetches `/workspace/files?path=` lazily as users expand folders, and refreshes affected paths when `workspace.file` events arrive.
- Selecting a file fetches `/workspace/file?path=` and renders read-only syntax-highlighted content in `code-viewer.tsx`.
- Code viewer is read-only — generated files are never edited from the UI.

## Part C — Real Remotion Preview

- Replace the Phase 2 placeholder composition.
- The Player loads the entry composition from the sandbox workspace. For MVP, copy the workspace's `src/index.ts` (and dependencies) into a path Vite can serve, or use a dev-only proxy.
  - Recommend: Vite dev server is configured to serve `sandbox/.workspace/` under a virtual path; the Player imports from that path.
- On `workspace.file` events affecting the composition entry or scene files, invalidate the bundle and re-mount the Player.
- Show a "rendering preview…" overlay while the Player rebuilds.

If the workspace is empty (first session, before Implementor has written anything), show a friendly placeholder card instead of a broken Player.

## Part D — Upload UI

### Frontend

- Drag-and-drop zone integrated into the chat panel (drop anywhere over the chat area).
- Also: an explicit "+ Upload" button next to the chat input.
- Submits multipart `POST /uploads` to the route built in `phase-3-knowledge-and-uploads.md`.
- Per-upload row in chat thread shows ingest status pulled from `upload.status` events: `pending` → `done` / `errored`. PDFs may take longer (chunk + embed); the row stays `pending` until the handler emits `done`.
- On `done`, show a one-line confirmation (file name + how it was handled — "added as asset", "indexed for retrieval", "saved to uploads") so the user has feedback the system understood the file.

Accept: PDF, MD, TXT, CSV, and `image/*` (PNG, JPG, SVG, etc.). Reject anything else (including fonts, video, audio, archives) with a clear message — must match the `415` set the T1B router already enforces, otherwise the UI accepts files the server then rejects.

### Server-side changes needed (deferred from T1B)

T1B shipped `POST /uploads` as **synchronous** — the response only returns once ingest is finished. Phase 4's UI requirement ("show ingestion progress, not just upload progress" — see Constraints below) requires the route to return early and let the SSE stream carry the rest. Make these edits when wiring part D:

- `mastra/src/mastra/uploads/router.ts` — change the response to `{ assetId, ingestStatus: 'pending' }` and dispatch ingest as a background task (`queueMicrotask` / detached `Promise`). Errors thrown after the response must surface as a final `upload.status` event with `status: 'errored'`, not as an unhandled rejection.
- `mastra/src/mastra/uploads/ingest.ts` — emit `bus.emit('upload.status', { assetId, status: 'pending', ... })` on entry and `'done'` / `'errored'` on terminal state. Bus is the one created in part A of this phase.
- Optional intermediate events (`parsed`, `embedded`) can be added inside the per-type handlers and `knowledge/ingest-text.ts` if they're cheap to emit; the UI treats anything other than `done`/`errored` as "still working" so the schema doesn't need to grow.
- Update T1B's checkpoint 1 expectation: the POST response is `ingestStatus: 'pending'`, terminal state arrives over SSE.

This is the only T1B code change required for part D. Everything else (handler logic, accepted MIME set, asset shape, `appendAsset`) stays untouched.

## Part E — Connection Status

`connection-status.tsx` is a small badge cluster (top-right of the shell):

- `Mastra :4111` — derived from the SSE connection state.
- `Sandbox :4311` — derived from `service.health` events.

Click a badge → opens a popover with the last error/health message and a "retry" button (for the Mastra connection — the SSE client closes and re-opens).

## Configuration

```env
# web/.env
VITE_MASTRA_URL=http://localhost:4111
VITE_EVENTS_PATH=/events
```

No new env vars. The watcher and read-through routes import `sandboxRoot` from `mastra/src/mastra/sandbox-root.ts`, which already resolves the sandbox root dir from `WORKSPACE_PATH` (optional override) or the file-anchored default.

## Files To Create / Modify

```
mastra/src/mastra/server/events.ts          # new
mastra/src/mastra/server/workspace-files.ts # new
mastra/src/mastra/server/watcher.ts         # new
mastra/src/mastra/server/bus.ts             # new — in-process EventEmitter
mastra/src/mastra/index.ts                  # modify — register routes, start watcher

web/src/lib/events.ts                       # new
web/src/lib/workspace-api.ts                # new
web/src/components/activity-panel.tsx       # rewrite (was placeholder)
web/src/components/file-tree-panel.tsx      # rewrite (was placeholder)
web/src/components/code-viewer.tsx          # new
web/src/components/player-panel.tsx         # rewrite (was placeholder)
web/src/components/upload-dropzone.tsx      # new
web/src/components/connection-status.tsx    # new
web/src/components/chat-panel.tsx           # modify — embed dropzone + ingest rows
web/src/routes/index.tsx                    # modify — wire components together
```

## Checkpoint — End-to-End

Run all three services:

```bash
bun run dev
```

Then in the browser at `http://localhost:3000`:

1. **Connection status** shows both services green.
2. Send: *"Create a 20-second product demo for a note-taking app. Show capture, organize, share."*
3. **Activity panel** streams Planner → Art Director → Implementor events with timestamps and tool calls.
4. **File tree** populates as the Implementor writes files; new files appear without manual refresh.
5. Click a generated scene file → **code viewer** shows its contents.
6. **Preview** renders the generated composition once the Implementor finishes; reloads automatically when files change.
7. Drag a logo PNG onto the chat panel → upload row shows `pending` → `done`; activity panel emits an `upload.status` event.
8. Send: *"Use this logo in the intro."* — Implementor reads the asset from `assets/`, preview updates.
9. Stop the sandbox process → sandbox badge goes red, an `error` event appears in the activity panel; restart sandbox → badge goes green again.

## Constraints

- The browser must not access the filesystem directly. All workspace access goes through Mastra read-through routes.
- The code viewer is read-only.
- No long-poll fallback. SSE is the single transport.
- Upload UI must show ingestion progress, not just upload progress — users care that the system understood the file, not just that bytes arrived.
- Preview must not crash on an empty workspace. Fall back to a placeholder.

## Reference

- [`phase-2-frontend.md`](phase-2-frontend.md) — the shell this builds on
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — supervisor + delegation hooks + event bus that emit `agent.*` events
- [`phase-3-memory-and-state.md`](phase-3-memory-and-state.md) — working memory + role-guarded helpers
- [`phase-3-knowledge-and-uploads.md`](phase-3-knowledge-and-uploads.md) — upload route + asset folder layout
- [`phase-3-mcp-client-and-skills.md`](phase-3-mcp-client-and-skills.md) — MCP client whose health drives the sandbox connection badge
- [`phase-3-sandbox-service.md`](phase-3-sandbox-service.md) — workspace path the watcher and read-through routes target
