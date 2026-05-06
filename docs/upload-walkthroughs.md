# Upload Walkthroughs

End-to-end traces for every supported upload type in T1B.

**Accepted types (MVP):** images (`image/*`), PDF (`application/pdf`), markdown (`text/markdown`, `.md`), plain text (`text/plain`, `.txt`), CSV (`text/csv`). Everything else — fonts (`.ttf`, `.otf`, `.woff*`), video, audio, archives, executables — is rejected at the router with `415 Unsupported Media Type`. Custom fonts come into Remotion via skill docs / npm at code-gen time, not via uploads.

The shared principle: the **upload router** decides at upload time where the file lands, based on mime type and an optional `kind` hint from the caller. Only images become Workspace State `Asset` rows. Large unstructured documents (PDF / markdown / text) go into the chunked Knowledge Store. CSVs are stored as raw files for the Implementor to operate on; nothing about CSVs is pre-processed by T1.

For the canonical layer definitions, see [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md#project-state-layers). For the spec these walkthroughs implement, see [`../tasks/phase-3-knowledge-and-uploads.md`](../tasks/phase-3-knowledge-and-uploads.md). For the layer principles, see [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md).

---

## PDF / Large Document Walkthrough

The full trace for a PDF upload.

### Setup

User starts a new project, types a prompt, and attaches `brand-guide.pdf` (say, 40 pages).

### Step 1: Upload Lands

The frontend posts the file to `POST /uploads` with `projectId` and (for PDFs) no `kind` hint needed.

```text
brand-guide.pdf
   │
   ▼
ingest.ts dispatches by mime → handlers/pdf.ts
```

### Step 2: Ingestion Into Knowledge Store

This happens once, at upload time, **before the user sends their question**. The PDF handler does exactly this and nothing more:

```text
brand-guide.pdf
   │
   ├─ pdf-parse (PDFParse) → text
   ├─ knowledge/ingest-text.ts:
   │     MDocument.fromText(text)
   │       .chunk({ strategy: 'recursive', maxSize: 500, overlap: 50 })
   │     (maxSize is CHARACTERS, not tokens)
   ├─ embedMany() against embeddingModel() — single batched call
   └─ store.ts → LibSQLVector upsert with row shape:
       { id: '<projectId>:<source>:<chunkIndex>',
         projectId, source, chunkIndex, text, embedding }
```

No auto-summary is generated. No mirror entry is written to Workspace State. The PDF's existence is implicit: when the Planner or Art Director needs a fact from it, they call `retrieveProjectKnowledge`.

### Step 3: User Sends Their Prompt

```text
"Make a 20-second launch video. Match the brand guide I uploaded."
```

### Step 4: Planner Decides Whether To Retrieve

The Planner sees the user message and the existing Workspace State (probably empty at this point). The brand guide is **not** announced via state — the Planner is told in conversation that a PDF was uploaded, or it infers from the prompt. Either way, it has the option to call:

```ts
retrieveProjectKnowledge({ query: "primary brand colors and tone", k: 6 })
```

The tool embeds the query, runs `LibSQLVector.query(...)` partitioned by `projectId`, and returns:

```ts
[
  { text: '...chunk text...', source: 'brand-guide.pdf', score: 0.83 },
  ...
]
```

The Planner reads the chunks and writes the brief:

```ts
setBrief({
  goal: "20-second launch video",
  audience: "...",
  tone: "confident, minimal",
  duration: 20,
  ...
})
```

The retrieved chunks are **not** stored anywhere — they were a one-time lookup that informed the brief.

### Step 5: Art Director

The Art Director reads `brief` from working memory. If a specific design fact is missing (e.g. animation pacing guidance), it calls `retrieveProjectKnowledge` itself. Otherwise it works from the brief alone, then writes `styleContext` and per-scene `sceneRegistry[n].design`.

### Step 6: Implementor

The Implementor has no retrieval tool and no memory-write tools. It reads `styleContext` and `sceneRegistry[n].design` from working memory (read-only) and runs the sandbox MCP tools to produce code. The brand guide is invisible to it; everything it needs is already distilled into the design.

### Step 7: Follow-Up Edits

User: *"Make the intro bolder."*

Planner classifies this as a design tweak, dispatches Art Director with the existing scene context. AD may or may not retrieve from the brand guide depending on whether it needs a fact (e.g. an alternate accent color) it doesn't already have in `styleContext`. Single retrieval call per turn at most; never per paragraph.

### Key Properties

- PDF is **chunked + embedded once**, at upload, partitioned by `projectId`.
- No automatic summary, no Workspace State mirror — the doc is reachable only via `retrieveProjectKnowledge`.
- Retrieval is a **tool call**, fired on demand by Planner or Art Director only. Implementor never sees it.
- Embedding uses one batched `embedMany` call per upload (not one-per-chunk). Re-uploading the same `(projectId, source)` pair overwrites by id; chunk hashing / cross-upload caching is intentionally **not** implemented.
- No cross-project memory — chunks are scoped to `projectId`.

---

## CSV Upload Walkthrough

T1 treats CSVs as raw files. There is no parsing, no schema extraction, no summary, no embedding, no execution store.

### Step 1: Upload Lands

```text
productivity-metrics.csv
   │
   ▼
ingest.ts dispatches by extension → handlers/csv.ts
```

### Step 2: Copy To Uploads Folder

```text
productivity-metrics.csv
   │
   └─ copy to <workspace>/uploads/<assetId>.csv
```

That's it. No row, no Knowledge Store entry, no working-memory write.

### Step 3: Implementor Operates On The File If Needed

If a downstream scene needs to derive a fact from the CSV, the Planner instructs the Implementor in natural language ("read `uploads/<file>.csv` and chart the monthly average"). The Implementor uses sandbox tools (`read_file`, `exec_command`) to parse and compute inside the sandbox. Any derived facts it needs to surface end up in the rendered video, not in working memory.

### Why This Path

CSV is structured data — embedding raw rows for vector search produces poor results and wastes tokens. Real analysis is a code-execution problem, which the Implementor already has via sandbox tools. T1 deliberately stops at "make the file reachable to the sandbox."

A more sophisticated CSV pipeline (parse-to-SQLite, schema-aware queries, derived-facts in Workspace State) is plausible later; it is **not part of T1**.

### Key Properties

- File is copied to `uploads/`, never embedded, never parsed by the upload handler.
- No `Asset` row is created (CSVs aren't reusable visual assets).
- The Implementor reads the raw file in the sandbox if a scene calls for it.

---

## Image Upload Walkthrough

Images have two intents and the caller declares which via the `kind` form field.

```text
image upload
  ├─ kind=asset:    "use this image in the video"
  │     → copy + Asset row in working memory
  │
  └─ kind=reference: "look at this for inspiration"
        → attach to conversation message, no Asset row
```

The Planner decides which intent applies during conversation and sets `kind` when it instructs the frontend (or the user picks via UI). T1 trusts the hint; it does not classify on its own.

### Asset Mode

The user uploads a logo, product screenshot, or brand illustration that should *appear in* the generated video.

#### Step 1: Upload Lands

```text
logo-dark.png  (multipart: kind=asset, projectId=...)
   │
   ▼
ingest.ts switch on detectHandlerKind('image/png') → handlers/image.ts (asset path)
```

#### Step 2: File Copy + Asset Row

```text
logo-dark.png
   │
   ├─ copy to <workspace>/assets/<assetId>.png
   └─ call appendAsset({
        projectId,
        asset: {
          id: '<assetId>',                 // randomUUID() from node:crypto
          path: 'assets/<assetId>.png',   // relative to <workspace>
          originalName: 'logo-dark.png',
          mime: 'image/png',
          bytes,
          description: '',                 // VLM populates later
        },
      })
      // appendAsset stamps createdAt and writes the assets[] row.
```

`description` is intentionally empty in T1. A multimodal description step (VLM-once-at-upload, populating `description`) will be added when an image-capable model is wired up; the field is already in the schema so no migration is needed later.

#### Step 3: Agents Use The Asset

- **Planner** sees `assets[]` in working memory and references the asset by id when writing the brief.
- **Art Director** uses asset ids in scene designs ("scene 5: full-bleed reveal of asset `<id>`").
- **Implementor** reads `Asset.path` from working memory and includes the file in the Remotion code via the sandbox.

The image is never re-embedded, never re-described, never re-uploaded.

### Reference Mode

The user uploads a screenshot or sketch and says *"make something like this"*. The image should not appear in the video — the model needs to reason about it for the current turn.

```text
image upload (kind=reference)
   │
   └─ handlers/image.ts (reference path):
       normalize to a content block on the current chat message;
       no Asset row; no copy to assets/
```

For multimodal-capable models, the image block is passed directly. For text-only models, the handler runs a one-time VLM-to-text description and inserts the description into the message. (Same VLM dependency as the asset-mode `description` field — both light up together when the multimodal model lands. Until then, reference mode is best avoided in the UI.)

### Key Properties

- Asset mode: file copied to `assets/`, `Asset` row appended to working memory with `description: ''`. Pixels are never embedded.
- Reference mode: image lives only on the conversation message for that turn.
- VLM-derived metadata is deferred; the schema reserves `description` for it.

---

## Rejected: Fonts (and other unsupported types)

Fonts (`.ttf`, `.otf`, `.woff`, `.woff2`), video, audio, and archives are **rejected** at the router with `415 Unsupported Media Type`. The router answers with `{ "error": "Unsupported upload type: ..." }` and writes nothing to the workspace, the Knowledge Store, or working memory.

Earlier drafts of this doc routed fonts through a generic asset handler. That was removed: fonts in MVP come into Remotion at code-gen time (skill docs / npm), not via the upload pipeline. If user-uploaded fonts become a real need later, that gets its own task spec.

```text
brand-font.woff2  (multipart: projectId=...)
   │
   ▼
ingest.ts → detectHandlerKind() returns null
   │
   └─ router returns 415 { error: "Unsupported upload type: font/woff2 (brand-font.woff2)" }
```

---

## Summary Table

| Input Type | Handler | Persisted To | Retrieval At Query Time? |
|---|---|---|---|
| PDF / large doc | `pdf.ts` → `ingest-text.ts` | Knowledge Store (chunks) | On demand via `retrieveProjectKnowledge` |
| Markdown / text | `text.ts` → `ingest-text.ts` | Knowledge Store (chunks) | On demand via `retrieveProjectKnowledge` |
| CSV | `csv.ts` | `<workspace>/uploads/<id>.csv` | No (sandbox reads file directly when needed) |
| Image, `kind=asset` | `image.ts` (asset branch) | `<workspace>/assets/` + `Asset` row in working memory | No |
| Image, `kind=reference` | `image.ts` (reference branch) | Conversation message for that turn only | Not applicable |
| Font (`.ttf`, `.otf`, `.woff*`), video, audio, archive | (rejected) | nothing | nothing — `415` returned |

The repeated principle: **default to Workspace State or filesystem, fall back to retrieval only for facts inside large documents.** Retrieval is the exception, not the default. Implementor never retrieves; only Planner and Art Director do.

## Out Of Scope For T1

These appeared in earlier drafts of this doc and are deliberately not part of T1:

- Auto-summarizing PDFs at upload time and mirroring summaries into Workspace State.
- A separate `WorkspaceState.documents` registry of uploaded files.
- CSV parsing, schema extraction, or a `run_data_query` execution pipeline.
- VLM-at-upload for images (the `description` field exists but stays empty).
- Inlining small text/markdown files into Workspace State.

If any of these become necessary, they get their own task spec.
