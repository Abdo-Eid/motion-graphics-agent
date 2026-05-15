# Phase 3 — T1B — Knowledge Store & Uploads

**Status: Complete.** Track B of T1, delivered alongside T1A. Pairs with [`T1A-memory-and-state.md`](T1A-memory-and-state.md). Shared overview: [`T1-memory-knowledge-uploads.md`](T1-memory-knowledge-uploads.md).

For the role/principles framing (state layers, retrieval rules, agent read/write matrix, filesystem ownership), see [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md). For per-input-type ingest traces and the accepted-MIME table, see [`../docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md). This file documents the code-level decisions and acceptance proof; do not duplicate doc content here.

## Scope Decisions

| Decision               | Choice                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Knowledge Store vector | `@mastra/libsql` `LibSQLVector`, separate instance from any Memory-internal vector; **same DB file** (`file:./mastra.db`)    |
| Embedding model        | AI SDK `embed` / `embedMany` against Track A's shared `embeddingModel()` from `mastra/src/mastra/model.ts`                   |
| Chunking               | `MDocument.chunk()` from `@mastra/rag` — `markdown` for `.md`, `recursive` otherwise                                         |
| Asset storage          | Files copied under `<workspaceRoot>/assets/`; path resolved by the Mastra workspace-root helper                              |
| Upload transport       | Mastra `apiRoutes` on port 4111 (no separate Express, no SSE)                                                                |

## File Layout

```text
mastra/src/mastra/
  workspace-root.ts         # File-anchored workspace-root path resolver. NOT Workspace State.
  knowledge/
    store.ts                # LibSQLVector index + lazy ensureProjectKnowledgeIndex + read-time metadata guard
    ingest-text.ts          # MDocument -> embedMany -> upsertProjectKnowledge
    retrieve.ts             # retrieveProjectKnowledge tool (Planner / Art Director only)
  uploads/
    router.ts               # POST /uploads, randomUUID assetId (node:crypto)
    ingest.ts               # detectHandlerKind + switch dispatch
    handlers/{pdf,text,csv,image}.ts
```

No `chunker.ts` and no `embeddings.ts` ship — chunking is `MDocument`, embedding is inlined `embed`/`embedMany` at the two callers. See [Delivery Summary](#delivery-summary).

## Coordination With Track A

- **`Asset` zod schema** is locked in Track A's `memory/schema.ts`. Only images produce Asset rows. Image handler populates: `id` (UUID v4 from `node:crypto.randomUUID()`), `path` relative to `workspaceRoot` (`assets/<id>.<ext>`), `originalName`, `mime` (always `image/*`), `bytes`, `description: ""`. `createdAt` is stamped by `appendAsset`. Docs (pdf/csv/txt/md) and `kind=reference` images do **not** call `appendAsset`.
- **`appendAsset` vs `addAsset`** — Track A exposes both. `addAsset` is the role-guarded `createTool`. `appendAsset` is the underlying impl; upload handlers run as the system path and import `appendAsset` directly to skip the role check and bypass the tool-context cast. The `addAsset` tool is preserved for any future role-guarded system caller.
- **`projectId` propagation:** the multipart form carries `projectId`. Track A's invariant `threadId === projectId === resourceId` carries through — `appendAsset` uses `projectId` as both `threadId` and `resourceId`. Same value is the Knowledge Store partition key on every read/write.

## Knowledge Store Specifics

- **Schema:** `(id, projectId, source, chunkIndex, text, embedding, metadata)`. Row id format: `<projectId>:<source>:<chunkIndex>` — encodes both the project (cross-tenant safety) and the source (so different docs in one project share `chunkIndex` 0 cleanly). Re-uploading the same `(projectId, source)` overwrites by id.
- **Chunking:** `MDocument`, `maxSize: 500`, `overlap: 50`. **`maxSize` is character count, not tokens** (≈ 80–125 tokens). `semantic-markdown` rejected for MVP (per-doc LLM calls).
- **Embeddings:** single `embedMany` call per upload. No process-local cache (deleted as theater — see Delivery Summary).
- **Retrieval tool:** `retrieveProjectKnowledge({ query, k })`. `projectId` read from `context.agent?.threadId ?? context.agent?.resourceId` (invocation context is authoritative; agents can't be trusted to pass it as a tool input). Default `k = 4`, hard cap `k <= 12` (zod-enforced).
- **Not Semantic Recall.** Mastra's Semantic Recall is RAG over chat history; we don't need it (Observational Memory covers chat compression, this store covers project documents).

## Upload Endpoint

Registered via `Mastra({ server: { apiRoutes: [...] } })` so it shares port 4111.

```
POST /uploads
  multipart: file (required), kind (optional, 'asset' | 'reference'), projectId (required)
  -> { assetId, ingestStatus: 'pending' | 'done' | 'errored' }
```

POST **awaits** ingest synchronously and returns the terminal status. There is no `GET /uploads/:assetId/status` SSE — it shipped in early review and was deleted as dead code (it could only ever emit the same terminal status the POST response already carried, because nothing produced intermediate progress events). Progress streaming for the upload UI is the responsibility of [Phase 4 part D](phase-4-frontend-integration.md#part-d--upload-ui), which (a) switches this POST to return `{ assetId, ingestStatus: 'pending' }` early and (b) emits `upload.status` events on the shared bus that Phase 4 part A already exposes via `GET /events/:projectId`. Do not re-introduce a private upload SSE.

The accepted-MIME table and per-type ingest traces live in [`../docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md). The asset-vs-reference classification for images is the Planner's job; the upload handler trusts the `kind` field. Router validates `kind` ∈ `{'asset', 'reference', absent}` — anything else → `400`. Unsupported MIME → `415` from `detectHandlerKind` returning `null` (no exception class).

The PDF and text handlers share `knowledge/ingest-text.ts`; per-format handlers stay thin.

## Dependencies Added

To `mastra/package.json`: `@mastra/rag`, `pdf-parse`, `ai` (already from T1A — uses `embed`/`embedMany`).

No `nanoid` — `assetId` is `randomUUID()` from `node:crypto`. No `@ai-sdk/openai` — embeddings route through T1A's `embeddingModel()` factory which uses `@ai-sdk/azure`.

## Wiring

- Upload routes registered via `apiRoutes` on `Mastra({ server })` in `mastra/src/mastra/index.ts`.
- A single throwaway `t1TestAgent` carries `setBrief`, `setStyleContext`, `setSceneDesign`, `retrieveProjectKnowledge` for Studio Playground verification. **`addAsset` is excluded** (system-only). **Delete `t1TestAgent` once T2 / T3 land.**
- Export `retrieveProjectKnowledge` from `knowledge/retrieve.ts`. T2 (Planner) and T3 (Art Director) import it. **Never attach to Implementor.**

## Configuration

```env
# mastra/.env (Track B's vars; full set in repo .env.example)
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
# WORKSPACE_PATH is optional. Defaults to the Mastra-owned local .workspace
# directory. Override only to point uploads and generated files at a different
# absolute directory.
# WORKSPACE_PATH=C:\absolute\path\to\workspace
```

The LibSQL URL is **not** an env var. Both Memory (Track A) and the Knowledge Store pin `url: "file:./mastra.db"` directly; Mastra resolves it relative to its working directory, so the file lands at `mastra/mastra.db`. `workspaceRoot` is shared by upload handlers and Mastra Workspace tools so asset paths align.

## Checkpoints

Track A's checkpoints 1–2 must already pass. Verify uploads with `curl`, retrieval through Mastra Studio.

```bash
bun --filter mastra dev   # Mastra server on :4111, Studio URL printed
```

Studio has no multipart upload widget, so upload is `curl`. Retrieval is via `t1TestAgent` in the Playground with `threadId='proj-1'`. Examples below use `proj-1`; in the real app generate `randomUUID()` (from `node:crypto`) and reuse it as both `threadId` and `resourceId`.

1. **Upload PDF + retrieval.**

    ```bash
    curl -F file=@sample.pdf -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - Response: `{ assetId, ingestStatus: 'done' }` (synchronous).
    - `mastra/mastra.db` has chunk rows for that `projectId` with non-zero 1536-dim embeddings.
    - In Studio Playground (`threadId='proj-1'`), call `retrieveProjectKnowledge({ query: '<a question whose answer is in the PDF>', k: 4 })` → returns chunks with `score` and the right `source`.

2. **Upload markdown / text.**

    ```bash
    curl -F file=@notes.md -F projectId=proj-1 http://localhost:4111/uploads
    ```

    Same flow as PDF. Repeat with `.txt` to confirm both extensions hit `text.ts`.

3. **Upload image (asset intent).**

    ```bash
    curl -F file=@logo.png -F kind=asset -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - File at `<workspaceRoot>/assets/<assetId>.<ext>`.
    - Studio Working Memory for `proj-1` shows `assets[]` with `{ id, path: 'assets/<...>', originalName, mime, bytes, description: '', createdAt }`.
    - No chunks written for this upload.

4. **Upload CSV.**

    ```bash
    curl -F file=@data.csv -F projectId=proj-1 http://localhost:4111/uploads
    ```

    File copied verbatim to `<workspaceRoot>/uploads/<assetId>.csv`. No chunking, no embedding, no Asset row.

5. **Reject unsupported types.**

    ```bash
    curl -i -F file=@song.mp3 -F projectId=proj-1 http://localhost:4111/uploads
    ```

    `415` with body `{ "error": "Unsupported upload type: ..." }`. Repeat with `.ttf` and `.mp4`. Nothing written anywhere.

6. **Walkthrough match.** Behavior matches the trace in [`../docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md). If reality and the doc disagree, fix the code.

Acceptance = all six pass *and* the constraints below hold.

## Constraints

- Implementor must not have access to `retrieveProjectKnowledge` (architecture invariant — see [`../docs/architecture.md`](../docs/architecture.md) and [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md)).
- Raw uploaded files are read-only inputs. Generated artifacts go to `<workspaceRoot>/src/` and `out/`, never back into upload sources.
- Use `embedMany` for batched single-call embedding. No per-chunk loops, no in-memory cache.
- Both ingest and query route through `embeddingModel()` from `mastra/src/mastra/model.ts`. Mixing models between ingest and query produces nonsense cosine scores.
- `appendAsset` is the only path that writes the `assets` array from upload code. The `addAsset` tool exists for future role-guarded system callers; do not call the tool from upload handlers.
- `t1TestAgent` is throwaway. Delete when T2 / T3 land.

## Reference

- [`T1-memory-knowledge-uploads.md`](T1-memory-knowledge-uploads.md) — overall T1 overview
- [`T1A-memory-and-state.md`](T1A-memory-and-state.md) — Track A (provides `Asset` schema, `appendAsset`, `addAsset`)
- [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — knowledge layer principles
- [`../docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md) — per-type traces
- AI SDK embeddings: <https://ai-sdk.dev/docs/ai-sdk-core/embeddings>
- LibSQL vector: <https://docs.turso.tech/sdk/ts/quickstart>
- Mastra custom API routes: <https://mastra.ai/docs/server-db/custom-api-routes>
- Mastra RAG chunking (`MDocument`): <https://mastra.ai/docs/rag/chunking-and-embedding>

---

## Delivery Summary

Final shipped state diverges from the original spec in places. This section captures what changed and why so future readers don't chase obsolete guidance.

### Decisions made during review

1. **No per-handler embedding wrapper.** `knowledge/embeddings.ts` deleted; `embedMany`/`embed` inlined at the two callers (`ingest-text.ts`, `retrieve.ts`). The original SHA-256 cache was theater — `embedMany` already does single-call batching, and a process-local hash cache only helps if the same text is uploaded twice in one session.
2. **No hand-rolled chunker.** `knowledge/chunker.ts` (122 lines) deleted in favor of `MDocument.chunk()` from `@mastra/rag`. `maxSize` is **characters**, not tokens — keep that in mind when tuning. Strategies: `markdown` for `.md`, `recursive` else.
3. **No SSE status route.** `GET /uploads/:assetId/status` and the listener pubsub (~70 lines, two Maps, `IngestContext`) deleted. POST returns terminal status synchronously. The upload-progress UI is real but lives downstream — see Phase 4 part D, which adds `bus.emit('upload.status', ...)` calls and switches POST to return `pending` early. Event taxonomy (`upload.status`) is already defined in `phase-4-frontend-integration.md` Part A.
4. **`UnsupportedUploadTypeError` deleted.** `detectHandlerKind` returns `null`; the route responds `415` with a JSON error body.
5. **Handler registry deleted.** `UploadHandler` / `UploadHandlers` types and the dispatch map replaced by a `switch` inside `ingestUpload`.
6. **Single test agent.** `memoryTestAgent` and `t1bRetrievalTestAgent` collapsed into one `t1TestAgent` carrying `setBrief`, `setStyleContext`, `setSceneDesign`, `retrieveProjectKnowledge`.
7. **`appendAsset` extracted from `addAsset`.** Image handler imports the plain impl directly. The role-guarded `addAsset` tool is preserved unchanged.
8. **`assetId` is `randomUUID()` from `node:crypto`.** Originally specced as `nanoid(21)`, then briefly `randomUUIDv7()` from `bun` — but Mastra CLI bundles the server in a Node-ish context where the virtual `"bun"` module does not resolve, breaking `bun run dev`. `node:crypto.randomUUID()` works under both `bun run` and `mastra dev`, has no dep, and `Asset.id` is `z.string()`. Don't hard-code id length or v7 ordering downstream.
9. **No env vars for LibSQL.** Original spec had `LIBSQL_URL`; it was removed. `LibSQLStore` (Track A) and `LibSQLVector` (Track B) pin `file:./mastra.db` directly. `WORKSPACE_PATH` remains an optional override for the filesystem workspace.
10. **Spec line corrected.** Original spec said `server.build.apiRoutes`. Correct shape (verified against installed `@mastra/core` types) is `server.apiRoutes`.

### Known acceptable limitations

- **Re-uploading a shorter version of an already-ingested doc leaves tail rows** (chunkIndex N+1..M from previous version). Acceptable for MVP; older rows become unreachable through normal queries because the new version's chunks score higher.
- **No persistent embedding cache.** `embedMany` saves the per-chunk overhead within an upload; cross-upload caching would need a LibSQL row keyed by chunk hash. Not built, not needed for MVP.
- **No upload progress streaming yet.** POST blocks until `done`/`errored`. Phase 4 part D owns the deferred work: switch POST to return `pending` immediately, dispatch ingest as a background task, emit `upload.status` events on the shared bus. T1B's code is the right shape for that change — handlers already return terminal status; only the route wrapper and a few `bus.emit` calls need to be added.

### Verification

- `tsc --noEmit -p mastra/tsconfig.json`: clean.
- `bun smoke.ts`: PASS (chat + 1536-dim embedding).
- `bun run scripts/test-memory-tools.ts` (Track A's harness): PASS for all four setters and role-rejection paths; defaults `projectId` to `randomUUID()` (from `node:crypto`) so each run is isolated.
- Manual: all six checkpoints above against `bun --filter mastra dev`.
