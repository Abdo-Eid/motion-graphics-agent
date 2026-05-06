# Phase 3 — T1B — Knowledge Store & Uploads

Track B of T1. Pairs with [`phase-3-memory-and-state.md`](phase-3-memory-and-state.md) (Track A). Both tracks share the spec overview in [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md).

## Your Role

Own the project knowledge layer and the upload pipeline that feeds it.

- **Project Knowledge Store** — vector-indexed chunks from large uploads. Separate from Mastra Memory. Used only when a fact is needed that doesn't live in Workspace State.
- **Upload handler** — turns raw user files into assets, Knowledge Store chunks, and Workspace State entries (via Track A's `addAsset` tool).

## Scope Decisions

| Decision               | Choice                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Knowledge Store vector | `@mastra/libsql` `LibSQLVector`, separate instance from any Memory-internal vector; same DB file as Track A is fine                                          |
| Embedding model        | AI SDK `embed` / `embedMany` using Track A's shared `embeddingModel()` factory from `mastra/src/mastra/model.ts`                         |
| Asset storage          | Files copied into `SANDBOX_WORKSPACE_DIR/assets/` so the Implementor reads them by relative path                                                             |
| Upload transport       | Mastra server `apiRoutes` on port 4111 (no separate Express app)                                                                                             |

## Where To Work

```text
mastra/src/mastra/
  knowledge/
    store.ts              # LibSQLVector index for chunks
    embeddings.ts         # AI SDK embed() / embedMany() against embeddingModel()
    chunker.ts            # text -> chunks
    retrieve.ts           # retrieveProjectKnowledge tool exposed to Planner / Art Director only
  uploads/
    router.ts             # POST /uploads + GET /uploads/:assetId/status (Mastra server apiRoutes)
    ingest.ts             # mime detection + dispatch + status events
    handlers/
      pdf.ts
      text.ts                 # .txt and .md
      csv.ts
      image.ts
```

## Coordination With Track A

- **`Asset` zod schema** is defined in Track A's `memory/schema.ts` and is **locked** — see the schema block in `phase-3-memory-and-state.md`. **Only images produce Asset rows.** When the image handler calls `addAsset`, populate: `id` (nanoid 21), `path` (relative to `SANDBOX_WORKSPACE_DIR`, e.g. `assets/<id>.png`), `originalName` (multipart filename), `mime` (detected, always `image/*`), `bytes` (`fs.stat`), `description: ""`, `createdAt` (ISO-8601). Docs (pdf/csv/txt/md) do **not** call `addAsset`. References (images flagged `kind=reference`) attach to the conversation message and skip `addAsset` too.
- **`addAsset` tool** is exported from `memory/access.ts`. Upload handlers call it directly (this is the only path that writes the `assets` array). While Track A is in flight, stub `addAsset` locally as `(input) => assets.push(input)` against an in-memory array; swap to the real import at merge.
- **`projectId` propagation**: upload routes receive `projectId` from the multipart form. Pass it as both `threadId` and `resourceId` when calling `addAsset`. Same value is used as the Knowledge Store partition key.

## Knowledge Store

- **Backend:** `LibSQLVector` (own instance, same DB file as Track A's memory).
- **Schema:** `(id, projectId, source, chunkIndex, text, embedding, metadata)`.
- **Chunking:** ~500-token chunks with ~50-token overlap. Source-aware (don't break mid-section in markdown).
- **Embeddings:** AI SDK `embedMany`/`embed` against `embeddingModel()` from `../model`; cache by chunk hash so re-uploads don't re-embed unchanged text.
- **Retrieval tool:** `retrieveProjectKnowledge({ query, k })` exposed to **Planner** and **Art Director** only. Returns `{ text, source, score }[]`.
- **Implementor does not get retrieval.** It works from Workspace State + skill docs only.

This store is intentionally **not** Mastra's Semantic Recall — Semantic Recall is RAG over chat history, which we don't need (we already have Observational Memory for that, and the Knowledge Store for project documents).

## Upload Pipeline

### Endpoints

Both registered on the Mastra server via `Mastra({ server: { build: { apiRoutes: [...] }}})` so they share port 4111.

```
POST /uploads
  multipart: file (required), kind (optional hint), projectId (required)
  -> { assetId, ingestStatus: 'pending' | 'done' | 'errored' }
```

```
GET /uploads/:assetId/status
  -> SSE stream of status events
```

For T1 the SSE stream is upload-status-only. The shared in-process bus arrives in T2 (Planner / activity stream); when it lands, the upload status emitter merges into it.

### Ingestion Routing

**Accepted MIME types** (everything else returns `400` from the router):

| Input | Detected by | Lands in |
|---|---|---|
| PDF (`application/pdf`) | mime | Knowledge Store (chunks + embeddings) |
| Markdown / plain text (`text/markdown`, `text/plain`) | mime + extension (`.md`, `.txt`) | Knowledge Store (chunks + embeddings) |
| CSV (`text/csv`) | mime + extension | `uploads/<id>.csv` (raw file, no chunking, no Asset row) |
| Image (`image/*` — png, jpg, jpeg, webp, svg, gif) | mime | Caller passes `kind=asset` or `kind=reference`. Asset → `Asset` row + copy to `SANDBOX_WORKSPACE_DIR/assets/`. Reference → conversation thread only. |

The asset-vs-reference classification for images is the Planner's job (it sees message context); the upload handler trusts the `kind` field on the multipart form and the Planner sets it during conversation. T1 just acts on the hint. Fonts, video, and audio are **out of scope** for the MVP — reject them at the router with `415 Unsupported Media Type`.

### Per-Type Handlers

Each handler in `uploads/handlers/` exports:

```ts
export async function handle(
    input: UploadInput,
    ctx: IngestContext,
): Promise<IngestResult>;
```

Responsibilities:

- `pdf.ts` — extract text with `pdf-parse`, chunk (~500 tokens, ~50 overlap), embed, write chunks to Knowledge Store.
- `text.ts` — read `.txt` / `.md` as UTF-8, chunk (markdown-aware: don't split mid-section), embed, write chunks to Knowledge Store. Same output shape as `pdf.ts`.
- `csv.ts` — copy verbatim to `uploads/<id>.csv` (no parsing, no chunking, no Asset row). The Implementor reads it via sandbox tools when needed; the Planner can mention the path in chat.
- `image.ts` — for `kind=asset`: copy to `assets/<id>.<ext>`, call `addAsset({ id, path, originalName, mime, bytes, description: "", createdAt })`. A multimodal description step replaces the empty string when an image-capable model is wired up. For `kind=reference`: normalize to a content block, attach to the conversation message, no `addAsset` call.

## Files To Create

```
mastra/src/mastra/knowledge/
  store.ts              LibSQLVector index for chunks
  embeddings.ts         AI SDK embed/embedMany against embeddingModel()
  chunker.ts            Text -> chunks with overlap
  retrieve.ts           retrieveProjectKnowledge tool

mastra/src/mastra/uploads/
  router.ts             POST /uploads + GET /uploads/:assetId/status as Mastra apiRoutes
                        Rejects non-accepted mime types with 415.
  ingest.ts             MIME type -> handler dispatch, status emission
  handlers/
    pdf.ts              Extract, chunk, embed -> Knowledge Store
    text.ts             .txt/.md: chunk, embed -> Knowledge Store
    csv.ts              Copy verbatim to uploads/<id>.csv
    image.ts            kind=asset -> copy + Asset row; kind=reference -> conversation only
```

## Dependencies To Add

To `mastra/package.json` (Track B owns these — Track A doesn't touch deps):

- `pdf-parse` — PDF text extraction
- `ai` — `embed` / `embedMany` from AI SDK core

Verify versions against the AI SDK docs before adding.

## Wiring

- Register the upload routes via `apiRoutes` on the `Mastra({ server: ... })` config in `mastra/src/mastra/index.ts` (shared merge step with Track A).
- Export `retrieveProjectKnowledge` from `knowledge/retrieve.ts`. T2 (Planner) and T3 (Art Director) import it. **Never attach to Implementor.**

## Configuration

```env
# mastra/.env (Track B's vars)
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
SANDBOX_WORKSPACE_DIR=../sandbox/.workspace
```

`SANDBOX_WORKSPACE_DIR` is shared with the sandbox service so asset paths align. The main app only writes to the `assets/` and `uploads/` subfolders; everything else under that path is owned by the sandbox.

## Checkpoints

Track A's checkpoints 1–2 must already pass (the `addAsset` tool and the `Asset` schema must exist). You verify uploads with **`curl`** against the Mastra server, and verify retrieval through **Mastra Studio**.

```bash
bun --filter mastra dev   # Mastra server on :4111, Studio URL printed
```

Mastra Studio doesn't have a multipart upload widget, so the upload side is `curl`. The retrieval side runs in Studio: wire a throwaway test agent in `mastra/src/mastra/index.ts` that has `retrieveProjectKnowledge` attached so you can call it from the Playground. Delete the test agent once T2/T3 land.

1. **Upload PDF + retrieval.**

    ```bash
    curl -F file=@sample.pdf -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - Response shape: `{ assetId, ingestStatus: 'pending' | 'done' }`. Stream status with `curl -N http://localhost:4111/uploads/<assetId>/status` until you see `done`.

- Inspect the LibSQL DB (`./mastra/data/motion-graphics-agent.db`) — chunks rows for that `projectId` exist with non-zero 1536-dim embedding vectors (matches `mastra/smoke.ts` output).
- In Studio Playground, open a thread with `threadId='proj-1'` and call `retrieveProjectKnowledge({ query: '<a question whose answer is in the PDF>', k: 4 })` → tool returns chunks with `score` values and the right `source`.

2. **Upload markdown / text.**

    ```bash
    curl -F file=@notes.md -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - Same flow as PDF: chunks land in the Knowledge Store, retrievable via `retrieveProjectKnowledge`. Repeat once with a `.txt` to confirm both extensions hit `text.ts`.

3. **Upload image (asset intent).**

    ```bash
    curl -F file=@logo.png -F kind=asset -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - File appears under `sandbox/.workspace/assets/<assetId>.<ext>`.
    - In Studio's Working Memory tab for `proj-1`, the `assets` array contains `{ id, path: 'assets/<...>', originalName: 'logo.png', mime: 'image/png', bytes: <n>, description: '', createdAt: '<iso>' }`.
    - No chunks were written to the Knowledge Store for this upload (images are assets, not knowledge).

4. **Upload CSV.**

    ```bash
    curl -F file=@data.csv -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - File copied verbatim to `sandbox/.workspace/uploads/<assetId>.csv`. No chunking, no embedding, no Asset row.

5. **Reject unsupported types.**

    ```bash
    curl -i -F file=@song.mp3 -F projectId=proj-1 http://localhost:4111/uploads
    ```

    - Response is `415 Unsupported Media Type`. Repeat with `.ttf` (font) and `.mp4` (video) — both rejected. Nothing was written to the workspace, the Knowledge Store, or working memory.

6. **Walkthrough match.** Behavior for each accepted type matches the corresponding trace in [`docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md). If reality and the doc disagree, fix the code — don't quietly update the doc.

Acceptance = all six pass _and_ the constraints below hold (no `retrieveProjectKnowledge` on the Implementor; embedding cache keyed on chunk hash; no provider-specific deps; only images become Assets).

## Constraints

- Implementor must not have access to `retrieveProjectKnowledge`. It reads Workspace State + skill docs only.
- Raw uploaded files are read-only inputs. Generated artifacts go to `sandbox/.workspace/`, never back into the upload sources.
- Embedding cache must key on chunk text hash, not file name — re-uploads of the same content must not cost extra embedding calls.
- Do **not** introduce a provider-specific package (e.g. an Anthropic-only or Zhipu-only client). Stick to AI SDK's OpenAI-compatible client driven by env.

## Reference

- [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md) — overall T1 overview
- [`phase-3-memory-and-state.md`](phase-3-memory-and-state.md) — Track A (provides `Asset` schema and `addAsset` tool)
- [`docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — knowledge layer principles
- [`docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md) — per-type traces
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — main retrieval consumer
- [`phase-3-art-director-agent.md`](phase-3-art-director-agent.md) — secondary retrieval consumer
- AI SDK embeddings: <https://ai-sdk.dev/docs/ai-sdk-core/embeddings>
- LibSQL vector: <https://docs.turso.tech/sdk/ts/quickstart>
- Mastra custom API routes: <https://mastra.ai/docs/server-db/custom-api-routes>
