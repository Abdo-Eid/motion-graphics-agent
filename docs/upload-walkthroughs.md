# Upload Walkthroughs

End-to-end traces for non-PDF upload types under the 3-layer model (Conversation Context, Workspace State, Project Knowledge Store).

For the PDF case, see [`pdf-upload-walkthrough.md`](pdf-upload-walkthrough.md).

The shared principle: the **upload router** decides at upload time where the file lands. Small/structured artifacts go directly into Workspace State. Only large unstructured documents go into the chunked Knowledge Store.

---

## CSV Upload Walkthrough

### Setup

User starts a project and attaches `productivity-metrics.csv` along with a prompt.

### Step 1: Upload Lands

The frontend uploads the file. The upload router classifies it.

```text
productivity-metrics.csv (e.g. 5,000 rows)
   │
   ▼
Upload Router
   │
   ├─ tiny CSV (handful of rows)?  → inline as text into Workspace State
   └─ analytical CSV?              → execution pipeline (recommended path)
```

CSV is **not** a classic RAG case. We do not embed raw rows and search them semantically — that produces poor results and wastes tokens. CSV is structured data; the right operation is execution, not retrieval.

### Step 2: Ingestion Into Execution Storage

For an analytical CSV, this happens once, at upload time, before the user's question runs.

```text
productivity-metrics.csv
   │
   ├─ parse into a dataframe / SQLite table
   ├─ extract schema (columns, types, row count)
   ├─ optionally compute lightweight summary stats
   │   (min, max, mean, distinct counts)
   └─ register an entry:
        { id, source, schema, rowCount, sampleRows, summaryStats }
```

The raw rows live in the execution store (SQLite or dataframe). They are **not** embedded.

### Step 3: Workspace State Gets A Lightweight Reference

```text
WorkspaceState.datasets += {
  source: 'productivity-metrics.csv',
  schema: [
    { name: 'team',       type: 'string' },
    { name: 'date',       type: 'date'   },
    { name: 'tasks_done', type: 'number' }
  ],
  rowCount: 5000,
  sampleRows: [ ...first 5 rows... ],
  summary: 'Daily team productivity, 12 teams, 2024-01 to 2024-12.',
  executionStoreId: 'csv-xyz789'
}
```

The Planner can see the schema and a small sample without querying. That is usually enough to plan a video around the data.

### Step 4: User Sends Their Prompt

```text
"Make a 30-second video showing how productivity improved
 after we shipped the new editor."
```

### Step 5: Planner Reads Workspace State

The Planner sees the dataset entry: schema, row count, summary. It decides what specific facts the video needs.

To turn the data into a story, it doesn't read 5,000 rows — it asks for the answer. The Planner calls a tool:

```text
run_data_query(
  executionStoreId: 'csv-xyz789',
  intent: "compare average tasks_done before and after 2024-06"
)
```

Internally this either:
- Lets the model write SQL/Python that runs in the sandbox, or
- Uses a constrained query interface.

The execution returns a small structured result:

```text
{
  before: { avg_tasks_done: 14.2, period: 'Jan–May 2024' },
  after:  { avg_tasks_done: 22.7, period: 'Jun–Dec 2024' },
  delta:  '+59.9%'
}
```

This is a **derived fact**, not raw rows. It is small, exact, and ready for storytelling.

### Step 6: Result Is Stored In Workspace State

```text
WorkspaceState.dataSummaries += {
  source: 'productivity-metrics.csv',
  query: 'avg tasks_done before/after 2024-06',
  result: { before: 14.2, after: 22.7, delta: '+59.9%' },
  derivedFor: 'video brief'
}
```

The Planner uses these facts to build the brief:

```text
brief.keyMessages = [
  "Productivity rose 60% after the new editor launched"
]
```

### Step 7: Downstream Agents

- **Art Director** reads the brief and designs a "metric reveal" scene.
- **Implementor** writes the Remotion code, animating the number rising from 14.2 to 22.7.

Neither needs to touch the CSV again. The fact is already in Workspace State.

### Step 8: Follow-Up Edits

User: *"Show the same number but per team."*

The Planner sees the existing dataset entry and runs a new query:

```text
run_data_query(
  executionStoreId: 'csv-xyz789',
  intent: "average tasks_done per team, before vs after 2024-06"
)
```

A new `dataSummaries` entry is added. The Art Director updates the scene design. The Implementor updates the code.

### Tiny CSV Exception

If the CSV is small enough to inline (a dozen rows or so), skip the execution pipeline. Just paste the rows into Workspace State as text. The Planner reads them directly.

### Key Properties

- CSV is parsed and executed, not embedded.
- The Planner sees schema + sample + summary up front, runs queries on demand for specific facts.
- Derived facts go into Workspace State; raw rows do not.
- Each query is small, deterministic, and reusable.
- Tiny CSVs skip the pipeline entirely.

---

## Image Upload Walkthrough

Images have **two different intents**, and the upload router needs to decide which one applies up front.

```text
image upload
  ├─ understanding mode: "what is in this image?"
  │     → multimodal input or VLM-to-text description
  │
  └─ asset mode: "use this image in the video"
        → extract metadata + keep file path
```

### Asset Mode (most common case)

The user uploads a logo, a product screenshot, a brand illustration — something that should *appear in* the generated video.

#### Step 1: Upload Lands

```text
logo-dark.png
   │
   ▼
Upload Router → asset mode
```

#### Step 2: Metadata Extraction

This happens once, at upload time. A vision model is run **once** to describe the image. The result is structured metadata, not a raw embedding of pixels.

```text
logo-dark.png
   │
   ├─ run VLM once → description, dominant colors,
   │                 detected text, style notes, transparency
   ├─ store original file path (read-only uploads area)
   └─ register an asset entry
```

#### Step 3: Workspace State Gets The Asset

```text
WorkspaceState.assets += {
  name: 'logo-dark',
  path: '/uploads/logo-dark.png',
  role: 'logo',
  description: 'Primary brand logo, dark variant',
  colors: ['#000000', '#FFD700'],
  detectedText: 'Brand Name',
  style: 'minimal, high contrast',
  hasTransparency: true
}
```

Just like with PDFs, agents get free awareness via Workspace State without re-running the VLM.

#### Step 4: Agents Use The Asset

- **Planner** sees the asset list and includes the logo in the brief.
- **Art Director** uses the logo's colors and style to inform `styleContext`. Decides the closing scene reveals the logo.
- **Implementor** reads `assets[].path` and includes the file in the Remotion code.

The VLM is **not re-run**. The metadata already captured what's needed.

#### Step 5: Follow-Up Edits

User: *"Use the light logo instead."*

If the user uploaded both variants, both are already in `assets[]`. The Planner picks the right entry, the Implementor swaps the path. No retrieval, no VLM call.

If the variant is missing, the system can ask the user to upload it.

### Understanding Mode

The user uploads a reference screenshot or a sketch and says *"make something like this"*. The image is not meant to appear in the video — the model needs to reason about it.

Two paths:

- **Multimodal model**: pass the image directly to the model as an image input block on the current turn. No persistent storage needed. The model "sees" it for that turn.
- **Text-only model**: run the image through a VLM once, store the description as text, inject the description into context.

Either way, the description (or image input) is part of the **conversation context for that turn**, not a permanent Workspace State entry — unless the user wants to keep it as a reference artifact.

### Key Properties

- Asset mode: VLM runs once, metadata + file path go into Workspace State, the original file stays in the uploads area.
- Understanding mode: image (or its description) is consumed in conversation context for the relevant turn.
- The VLM is never re-run on the same file unless the file changes.
- Pixels are never embedded for vector retrieval. Searching assets uses metadata fields.

---

## Small Text Upload Walkthrough

A short text file, a markdown brief, or a small notes file. Anything that fits comfortably in context (rule of thumb: under ~4K tokens of extracted text).

### Step 1: Upload Lands

```text
brief.md (about 2KB)
   │
   ▼
Upload Router → small text → inline path
```

### Step 2: Inline Into Workspace State

No chunking. No embedding. No vector index. The full text goes straight into Workspace State.

```text
WorkspaceState.documents += {
  source: 'brief.md',
  inlinedContent: '...full file text...',
  inlined: true
}
```

Optionally, a one-line summary is also generated for quick scanning.

### Step 3: Planner Reads It Directly

When the Planner runs, the full document text is included in its context (or pulled from Workspace State directly). No retrieval tool is needed.

The Planner extracts the relevant facts:

```text
brief.goal = "30-second product walkthrough"
brief.audience = "developers"
brief.tone = "friendly, clear"
```

### Step 4: Downstream

The brief is now structured in Workspace State. The Art Director and Implementor work from the brief, not from the original `brief.md`. The original file is rarely touched again.

### Why This Path Exists

- Embedding short text is wasteful: chunking, vector storage, and retrieval all cost more than just including the file in the prompt.
- Retrieval over a 2KB file produces worse results than reading the whole thing — there's nothing to retrieve.
- The simplest path is the right path when the content fits.

### Key Properties

- No chunking, no embeddings, no retrieval tool.
- Full content lives in Workspace State.
- Agents read it like any other Workspace State field.
- The path scales: anything bigger crosses into the PDF/large-doc pipeline instead.

---

## Summary Table

| Input Type | Pipeline | Lives In | Retrieval At Query Time? |
|---|---|---|---|
| Small text / markdown | Inline directly | Workspace State (full content) | No |
| Large text / PDF | Chunk → embed → index + auto-summary | Knowledge Store (chunks) + Workspace State (summary) | On demand only |
| Tiny CSV | Inline as text | Workspace State | No |
| Analytical CSV | Parse → execute → derive facts | Execution store + Workspace State (schema, summaries, derived facts) | Only as data queries, not vector retrieval |
| Image (asset) | VLM once → metadata | Workspace State (typed asset entry) | No (metadata already in state) |
| Image (understanding) | Multimodal input or VLM-to-text | Conversation context for that turn | Not applicable |
| Generated artifacts (briefs, designs, scenes, errors) | Built by agents | Workspace State | No (read directly) |
| Skills | Search → load → read | Skill loader (separate from RAG) | On demand via skill tools |

The repeated principle: **default to Workspace State, fall back to a tool call only when a fact isn't already there.** Retrieval is the exception, not the default.
