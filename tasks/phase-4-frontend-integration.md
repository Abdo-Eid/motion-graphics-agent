# Phase 4 — Frontend Integration

## Your Role

Turn the Phase 2 frontend shell into a live surface. This task connects every panel to real backend events and real workspace files:

- agent activity events stream into the activity panel
- the file tree shows real workspace files
- the preview plays the real generated Remotion composition
- users can drag-and-drop uploads into the chat panel
- Mastra connection status is visible

## Scope Decisions

| Decision | Choice |
|---|---|
| Activity transport | SSE over the existing Mastra HTTP server |
| File access from browser | Read-through endpoint on the Mastra server |
| File-change detection | Watcher in the Mastra app, change events emitted onto the same SSE stream |
| Preview reload | Re-mount the Remotion Player when the composition entry file changes |

## Where To Work

```text
mastra/src/mastra/server/
  events.ts               # SSE route + in-process event bus
  workspace-files.ts      # GET /workspace/files, GET /workspace/file
  watcher.ts              # fs watcher emitting change events to the bus

web/src/
  lib/events.ts
  lib/workspace-api.ts
  components/activity-panel.tsx
  components/file-tree-panel.tsx
  components/code-viewer.tsx
  components/player-panel.tsx
  components/upload-dropzone.tsx
  components/connection-status.tsx
```

## Part A — Activity Stream

### Event Schema

```ts
type ActivityEvent =
  | { type: 'agent.start'; agent: AgentId; ts: number }
  | { type: 'agent.message'; agent: AgentId; text: string; ts: number }
  | { type: 'agent.tool'; agent: AgentId; tool: string; ts: number }
  | { type: 'agent.end'; agent: AgentId; ts: number }
  | { type: 'agent.error'; agent: AgentId; error: string; ts: number }
  | { type: 'workspace.file'; path: string; change: 'add' | 'change' | 'unlink'; ts: number }
  | { type: 'upload.status'; assetId: string; status: IngestStatus; ts: number }
  | { type: 'service.health'; service: 'mastra'; ok: boolean; ts: number }

type AgentId = 'planner' | 'art-director' | 'implementor'
```

### Server Side

- In-process event bus (`EventEmitter` is fine for MVP).
- SSE route: `GET /events/:projectId` opens a long-lived response, writes `data: {json}\n\n` per event, and sends a heartbeat comment every 15 seconds.
- Planner delegation hooks emit `agent.start`, `agent.end`, and `agent.error`.
- Upload pipeline emits `upload.status` events.
- Watcher emits `workspace.file` events under `<workspaceRoot>/src/`.
- The frontend reconstructs per-scene status from Workspace State and filesystem signals. There is no dedicated `scene.update` event.

### Client Side

```ts
export function useActivityStream(projectId: string): {
  events: ActivityEvent[]
  connection: 'connecting' | 'open' | 'closed'
}
```

The activity panel renders lanes for Planner, Art Director, Implementor, and system events.

## Part B — File Tree + Code Viewer

### Endpoints

```text
GET /workspace/files?path=<rel> -> [{ name, kind: 'file' | 'dir' }]
GET /workspace/file?path=<rel>  -> { content: string, mime: string }
```

Both resolve under the same workspace root used by Mastra Workspace tools. No browser code reads the filesystem directly.

### Frontend

- `file-tree-panel.tsx` fetches `/workspace/files?path=` lazily as users expand folders.
- Selecting a file fetches `/workspace/file?path=` and renders read-only code in `code-viewer.tsx`.
- Code viewer is read-only. Generated files are edited only by the Implementor through tools.

## Part C — Real Remotion Preview

- Replace the Phase 2 placeholder composition.
- The Player loads the entry composition from the workspace.
- For MVP, either copy the workspace's `src/index.ts` and dependencies into a Vite-served path, or add a dev-only proxy for workspace files.
- On `workspace.file` events affecting the composition entry or scene files, invalidate the bundle and re-mount the Player.
- Show a "rendering preview..." overlay while the Player rebuilds.
- If the workspace is empty, show a friendly placeholder card instead of a broken Player.

## Part D — Upload UI

### Frontend

- Drag-and-drop zone integrated into the chat panel.
- Explicit "+ Upload" button next to the chat input.
- Submits multipart `POST /uploads` to the route built in `T1B-knowledge-and-uploads.md`.
- Per-upload row in chat shows ingest status pulled from `upload.status` events.
- On `done`, show a one-line confirmation explaining how the file was handled.

Accept: PDF, MD, TXT, CSV, and `image/*`. Reject anything else with a clear message matching the server's supported MIME set.

### Server-side changes needed

T1B shipped `POST /uploads` as synchronous. Phase 4's UI requires the route to return early and let SSE carry terminal status:

- `mastra/src/mastra/uploads/router.ts` returns `{ assetId, ingestStatus: 'pending' }` and dispatches ingest as a detached task.
- `mastra/src/mastra/uploads/ingest.ts` emits `upload.status` events for `pending`, `done`, and `errored`.
- Errors thrown after the response must surface as final `upload.status: errored`, not as unhandled rejections.

## Part E — Connection Status

`connection-status.tsx` shows Mastra connection state only:

- `Mastra :4111` derived from the SSE connection state.
- Retry closes and reopens the SSE connection.

## Configuration

```env
VITE_MASTRA_URL=http://localhost:4111
VITE_EVENTS_PATH=/events
```

`WORKSPACE_PATH` is optional on the Mastra side. If unset, workspace routes use the same default workspace root as Mastra Workspace tools.

## Checkpoint — End-to-End

Run both services:

```bash
bun run dev
```

Then in the browser at `http://localhost:3000`:

1. Connection status shows Mastra connected.
2. Send: "Create a 20-second product demo for a note-taking app. Show capture, organize, share."
3. Activity panel streams Planner -> Art Director -> Implementor events.
4. File tree populates as Implementor writes files.
5. Click a generated scene file and verify code viewer shows it.
6. Preview renders the generated composition once Implementor finishes.
7. Drag a logo PNG onto the chat panel and verify upload status reaches `done`.
8. Send: "Use this logo in the intro." and verify the workspace/preview updates.

## Constraints

- Browser must not access the filesystem directly.
- Code viewer is read-only.
- No long-poll fallback. SSE is the single transport.
- Upload UI must show ingestion progress, not just upload progress.
- Preview must not crash on an empty workspace.

## Reference

- [`phase-2-frontend.md`](phase-2-frontend.md) — the shell this builds on
- [`T2-planner-agent.md`](T2-planner-agent.md) — supervisor + delegation hooks + event bus
- [`T1A-memory-and-state.md`](T1A-memory-and-state.md) — working memory + role-guarded helpers
- [`T1B-knowledge-and-uploads.md`](T1B-knowledge-and-uploads.md) — upload route + asset folder layout
