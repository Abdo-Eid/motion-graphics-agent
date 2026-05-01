# Phase 3 — Memory, Knowledge, and Uploads

## Your Role

Own the project's working state and knowledge layers. This is the data spine the three agents read and write through. It includes:

- **Workspace State** — structured, mutable project state.
- **Conversation Context** — chat thread per session with rolling summarization.
- **Project Knowledge Store** — vector-indexed chunks from large uploads.
- **Upload pipeline** — turns raw user files into Workspace State entries and/or Knowledge Store chunks, depending on file type.

`phase-3-orchestration.md` and the three agent tasks already assume this layer exists. They do not work without it.

## Scope Decisions

| Decision | Choice |
|---|---|
| Persistence | Mastra memory backed by `@mastra/libsql` (already installed) |
| Vector store | LibSQL vector extension — keeps the stack uniform |
| Session model | Single active project for MVP, but every record carries a `projectId` so multi-project is a backend-only change later |
| Embedding model | Match whatever the LLM provider exposes (Z.AI / Zhipu); fallback to a small local model if needed |
| Asset storage | Files copied into `SANDBOX_WORKSPACE_DIR/assets/` so the Implementor reads them by relative path |

## Where To Work

```text
mastra/src/mastra/
  memory/
    schema.ts             # zod types for Brief, StyleContext, SceneRegistry, etc.
    store.ts              # LibSQL-backed read/write
    access.ts             # role-aware helpers (write guards by agent role)
    summarizer.ts         # conversation rolling summary
    index.ts              # public exports
  knowledge/
    store.ts              # LibSQL vector index for chunks
    embeddings.ts         # embedding client
    chunker.ts            # text → chunks
    retrieve.ts           # retrieval tool exposed to Planner / Art Director
  uploads/
    router.ts             # POST /uploads HTTP route
    handlers/
      pdf.ts
      csv.ts
      image.ts
      text.ts
      asset.ts
    ingest.ts             # type detection + dispatch
```

## Workspace State Schema

Concrete types (zod). All fields scoped by `projectId`.

```ts
// memory/schema.ts (sketch)
export const Brief = z.object({
  goal: z.string(),
  audience: z.string(),
  tone: z.string(),
  duration: z.number(),
  assets: z.array(z.string()),     // asset ids
  keyMessages: z.array(z.string()),
  userPreferences: z.record(z.string(), z.string()).optional(),
})

export const StyleContext = z.object({
  palette: z.array(z.string()),
  fonts: z.array(z.string()),
  mood: z.string(),
  animationFeel: z.string(),
  transitions: z.string(),
})

export const SceneRecord = z.object({
  number: z.number(),
  name: z.string(),
  design: z.unknown().optional(),         // Art Director writes
  status: z.enum(['pending', 'building', 'built', 'errored']),
  filePath: z.string().optional(),
  errors: z.array(z.string()).default([]),
})

export const RoutingDecision = z.object({
  classification: z.enum(['exact-tweak', 'creative-change', 'restructure', 'error-fix']),
  route: z.array(z.enum(['planner', 'art-director', 'implementor'])),
  reason: z.string(),
})

export const Asset = z.object({
  id: z.string(),
  kind: z.enum(['logo', 'image', 'font', 'audio']),
  path: z.string(),                       // relative to sandbox workspace
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const DataSummary = z.object({
  source: z.string(),
  schema: z.array(z.object({ name: z.string(), type: z.string() })),
  derivedFacts: z.array(z.string()),
})

export const DocumentSummary = z.object({
  source: z.string(),
  summary: z.string(),
  knowledgePointer: z.string(),           // id used to retrieve chunks later
})

export const WorkspaceState = z.object({
  projectId: z.string(),
  brief: Brief.optional(),
  styleContext: StyleContext.optional(),
  sceneRegistry: z.array(SceneRecord).default([]),
  routing: RoutingDecision.optional(),
  assets: z.array(Asset).default([]),
  dataSummaries: z.array(DataSummary).default([]),
  documentSummaries: z.array(DocumentSummary).default([]),
})
```

## Field Ownership

Enforced at the access-helper layer, not just by convention.

| Field | Owner | Helper |
|---|---|---|
| `brief` | Planner | `setBrief(role, value)` rejects non-`planner` |
| `routing` | Planner | `setRouting(role, value)` |
| `styleContext` | Art Director | `setStyleContext(role, value)` |
| `sceneRegistry[n].design` | Art Director | `setSceneDesign(role, n, value)` |
| `sceneRegistry[n].status` | Implementor | `setSceneStatus(role, n, value)` |
| `sceneRegistry[n].filePath` | Implementor | `setSceneFilePath(role, n, value)` |
| `sceneRegistry[n].errors` | Implementor | `setSceneErrors(role, n, value)` |
| `assets` | Upload pipeline | `addAsset(systemRole, value)` |
| `dataSummaries` | Upload pipeline | `addDataSummary(systemRole, value)` |
| `documentSummaries` | Upload pipeline | `addDocumentSummary(systemRole, value)` |

Every helper takes an explicit role argument. A wrong role throws — the orchestration layer catches and surfaces a `field-ownership-violation` error event.

## Conversation Context

- Chat thread stored per `projectId`.
- When thread length exceeds `CONTEXT_TURN_LIMIT` (default 30 turns), older turns are summarized into a single rolling summary.
- The brief, current `routing` decision, and current scene statuses are **always** included alongside the summary so they survive truncation.
- Summary is regenerated on every overflow, not appended — keeps it bounded.

```ts
// memory/summarizer.ts (sketch)
export async function summarizeIfNeeded(projectId: string): Promise<void>
export async function readContext(projectId: string): Promise<{ summary?: string; recentTurns: Turn[] }>
```

## Knowledge Store

Vector-indexed chunks. Used only when a needed fact is not already in Workspace State.

- **Backend:** LibSQL vector extension (same DB as memory).
- **Schema:** `(id, projectId, source, chunkIndex, text, embedding, metadata)`.
- **Chunking:** ~500-token chunks with ~50-token overlap. Source-aware (don't break mid-section in markdown).
- **Embeddings:** call the active LLM provider's embedding endpoint; cache by chunk hash.
- **Retrieval tool:** `retrieveProjectKnowledge({ query, k })` exposed to **Planner** and **Art Director** only. Returns `{ text, source, score }[]`.
- **Implementor does not get retrieval.** It works from Workspace State + skill docs only.

## Upload Pipeline

### Endpoint

```
POST /uploads
  multipart: file (required), kind (optional hint), projectId (required)
  -> { assetId, ingestStatus: 'pending' | 'done' | 'errored' }
```

A second route streams ingest progress so the UI can show "summarizing…":

```
GET /uploads/:assetId/status
  -> SSE stream of status events
```

(The activity stream task adds the SSE event bus this hooks into.)

### Ingestion Routing

| Input | Detected by | Lands in |
|---|---|---|
| Short text or markdown (`.md`, `.txt` ≤ 8 KB) | mime + size | Workspace State (inlined into the brief context) |
| Large PDF, brand guide, doc (`.pdf`, large `.md`) | mime + size | Knowledge Store (chunks + embeddings) **and** Workspace State (`DocumentSummary` with pointer) |
| Tiny CSV (≤ 100 rows) | extension + row count | Workspace State (full content inlined) |
| Analytical CSV (> 100 rows) | extension + row count | Workspace State (`DataSummary` with schema + derived facts); raw rows live in execution store (out of MVP scope — schema + summary only) |
| Logo / image (`.png`, `.svg`, `.jpg`) | mime | Workspace State (`Asset` entry) + file copied to `SANDBOX_WORKSPACE_DIR/assets/` |
| Font (`.ttf`, `.otf`, `.woff*`) | mime | `Asset` + copied to assets folder |
| Reference image attached to a single chat turn | upload context flag | Conversation context only — not persisted as an asset |

### Per-Type Handlers

Each handler in `uploads/handlers/` exports:

```ts
export async function handle(input: UploadInput, ctx: IngestContext): Promise<IngestResult>
```

Responsibilities:

- `pdf.ts` — extract text, chunk, embed, write chunks to Knowledge Store, generate ~150-word summary, write `DocumentSummary` to Workspace State.
- `csv.ts` — parse, infer schema, derive 3–5 facts (row count, numeric ranges, top categories), write `DataSummary`.
- `image.ts` — write to assets folder, optionally extract dominant colors for `metadata`, write `Asset`.
- `text.ts` — short → inline; long → treat as PDF.
- `asset.ts` — copy file, write `Asset` entry; used for fonts and other binary assets.

## Files To Create

```
mastra/src/mastra/memory/schema.ts
mastra/src/mastra/memory/store.ts
mastra/src/mastra/memory/access.ts
mastra/src/mastra/memory/summarizer.ts
mastra/src/mastra/memory/index.ts
mastra/src/mastra/knowledge/store.ts
mastra/src/mastra/knowledge/embeddings.ts
mastra/src/mastra/knowledge/chunker.ts
mastra/src/mastra/knowledge/retrieve.ts
mastra/src/mastra/uploads/router.ts
mastra/src/mastra/uploads/ingest.ts
mastra/src/mastra/uploads/handlers/pdf.ts
mastra/src/mastra/uploads/handlers/csv.ts
mastra/src/mastra/uploads/handlers/image.ts
mastra/src/mastra/uploads/handlers/text.ts
mastra/src/mastra/uploads/handlers/asset.ts
```

## Wiring

- Register the upload route in `mastra/src/mastra/index.ts` alongside `chatRoute`.
- Expose `retrieveProjectKnowledge` as a Mastra tool attached to Planner and Art Director only.
- Attach memory access helpers to each agent via dependency injection (passed into the agent's tool factories) so the agent code only sees role-correct setters.

## Configuration

```env
# mastra/.env
LIBSQL_URL=file:./data/editing-agent.db
CONTEXT_TURN_LIMIT=30
EMBEDDING_MODEL=<provider-specific>
SANDBOX_WORKSPACE_DIR=../sandbox/.workspace
```

`SANDBOX_WORKSPACE_DIR` is shared with the sandbox service so asset paths align. The main app only writes to the `assets/` subfolder; everything else under that path is owned by the sandbox.

## Checkpoints

Run the Mastra server and exercise these:

1. **Memory roundtrip.** Initialize a session, write a brief through `setBrief('planner', ...)`, read it back. Writing through `setBrief('implementor', ...)` throws.
2. **Conversation summarization.** Push 35 simulated turns; verify summary is generated and the brief survives truncation.
3. **Upload PDF.** `POST /uploads` with a small PDF; verify `DocumentSummary` lands in Workspace State and chunks land in the Knowledge Store. Verify `retrieveProjectKnowledge({ query: '...' })` returns relevant chunks.
4. **Upload logo.** `POST /uploads` with a PNG; verify `Asset` entry is written and the file appears under `sandbox/.workspace/assets/`.
5. **Upload CSV.** `POST /uploads` with a 200-row CSV; verify `DataSummary` with schema + derived facts.

## Constraints

- Implementor must not have access to retrieval. It reads Workspace State + skill docs only.
- No agent writes to fields it does not own. Helpers enforce this.
- Raw uploaded files are read-only inputs. Generated artifacts go to `sandbox/.workspace/`, never back into the upload sources.
- Conversation summary must always include the brief, current routing decision, and current scene statuses.

## Reference

- [`docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — knowledge layer principles
- [`docs/pdf-upload-walkthrough.md`](../docs/pdf-upload-walkthrough.md) — end-to-end trace of a PDF upload
- [`docs/upload-walkthroughs.md`](../docs/upload-walkthroughs.md) — per-type traces
- [`phase-3-orchestration.md`](phase-3-orchestration.md) — consumer of memory + retrieval
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — main retrieval consumer
- [`phase-3-art-director-agent.md`](phase-3-art-director-agent.md) — secondary retrieval consumer
