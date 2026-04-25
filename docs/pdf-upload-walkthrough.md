# PDF Upload Walkthrough

Here's the full trace for a PDF upload under the 3-layer model.

## Setup

User starts a new project, types a prompt, and attaches `brand-guide.pdf` (say, 40 pages).

## Step 1: Upload Lands

The frontend uploads the file. The backend's **upload router** decides where it goes based on type and size:

```text
brand-guide.pdf (40 pages)
   │
   ▼
Upload Router
   │
   ├─ small / inline-able?  → no, too large
   └─ large doc?            → yes → Knowledge Store pipeline
```

## Step 2: Ingestion Into Knowledge Store

This happens once, at upload time, **before the user even sends their question**. This is the same implicit "reading document" pass you see in ChatGPT or Claude — the system pre-processes the file so the model has immediate awareness of it.

```text
brand-guide.pdf
   │
   ├─ extract text
   │     and tag every chunk with metadata:
   │     { source, page, chunkId }
   │
   ├─ chunk with overlap                              → stored chunks (with metadata)
   ├─ embed each chunk                                → vector index
   ├─ generate a structured summary (key points,       → stored summary
   │   tone, color palette mentions, terminology)
   └─ register a Knowledge Store entry:
        { id, source: 'brand-guide.pdf',
          summary, chunkIndexId, uploadedAt }
```

Three things now exist:
- A **chunked index** (large, queryable on demand) where each chunk carries `{ source, page, chunkId }`.
- A **summary** (small, ~1–2 KB).
- A registered Knowledge Store entry tying them together.

The chunk metadata is what makes citations possible later — see Step 10.

## Step 3: Workspace State Gets A Lightweight Reference

The summary is mirrored into Workspace State so the Planner can see at a glance that this document exists, without anyone running retrieval yet.

```text
WorkspaceState.documents += {
  source: 'brand-guide.pdf',
  summary: '40-page brand guide. Tone: confident, minimal.
            Primary colors #1a1a2e, #e94560. Logo usage rules.
            Typography: Inter, geometric sans...',
  knowledgeStoreId: 'doc-abc123'
}
```

The full chunked content stays in the Knowledge Store. Workspace State only holds the *summary* and a pointer.

## Step 4: User Sends Their Prompt

```text
"Make a 20-second launch video. Match the brand guide I uploaded."
```

## Step 5: Planner Reads Workspace State

The Planner sees:
- The user prompt.
- A document is attached: `brand-guide.pdf`, with a short summary.

The Planner now has options. It does **not** automatically run retrieval. It decides based on whether the summary is enough.

### Case A: Summary is enough
The summary already mentions tone, colors, and typography. The Planner uses those facts to draft the brief. No retrieval needed.

```text
brief.preferences.colorPalette = ['#1a1a2e', '#e94560']
brief.preferences.tone = 'confident, minimal'
brief.preferences.typography = 'Inter, geometric sans'
```

### Case B: Planner needs a specific detail
Maybe the user said "use the secondary product palette" and the summary doesn't mention it. The Planner calls a tool:

```text
search_project_docs(
  query: "secondary product color palette",
  knowledgeStoreId: 'doc-abc123'
)
```

The retrieval step runs:
- Embeds the query.
- Finds top-K chunks from `brand-guide.pdf`.
- Returns them as text.

The Planner reads the returned chunks and continues building the brief. The chunks are **not** stored in Workspace State — they were a one-time lookup.

## Step 6: Brief Is Finalized And Stored

```text
WorkspaceState.brief = {
  goal: "20-second launch video",
  tone: "confident, minimal",
  colorPalette: ["#1a1a2e", "#e94560"],
  typography: "Inter",
  ...
}
```

The brand guide's facts are now part of the project's structured state. The PDF doesn't need to be retrieved again unless someone asks a new question that's not covered.

## Step 7: Art Director Runs

The Art Director reads the brief and `styleContext` from Workspace State. It does not need to query the brand guide directly — the relevant facts are already distilled into the brief.

If something specific comes up later ("what does the brand guide say about animation pacing?"), the Art Director can call `search_project_docs` the same way the Planner can.

## Step 8: Implementor Runs

The Implementor uses the sandbox tools. It almost never queries the brand-guide directly — the design language is already encoded in `styleContext`.

## Step 9: Follow-Up Edit Two Days Later (Same Session)

User: *"Use the dark variant of the logo instead."*

- Conversation Context has the recent chat.
- Workspace State has the brief, styleContext, asset list (logo entries).
- Knowledge Store still has the brand-guide chunks.

The Planner classifies this as an exact tweak. It checks Workspace State for asset entries:

```text
WorkspaceState.assets = [
  { name: 'logo-dark', path: '...', colors: ['#000','#FFD700'] },
  { name: 'logo-light', path: '...', ... }
]
```

If the dark logo is already in `assets[]`, no retrieval is needed at all — straight to Implementor. If the user is asking about something the summary didn't capture, retrieval can fire.

## Step 10: Citations Come From Chunk Metadata, Not Per-Paragraph Tool Calls

When the user asks a question that uses the PDF and the answer references the document, citations appear inline like `(brand-guide.pdf, p.12)`. This is **not** a tool call per paragraph.

The flow is:

```text
1. Retrieval runs (once per turn, sometimes once per upload).
2. Top-K chunks come back, each carrying { source, page, chunkId }.
3. Those chunks are placed into the model's context.
4. The model writes its answer using those chunks.
5. For each claim, it emits a citation referencing the chunk
   metadata that is already in its context.
```

So a single retrieval call can power many cited paragraphs in one response. The model is just attaching pre-known metadata to its own output.

## Step 11: Follow-Up Retrieval Behavior

Retrieval fires **at most once per turn**, not per paragraph, and not on every user message.

Typical pattern:

- **Generic follow-up that fits the summary** → no retrieval, instant answer from existing context.
- **Specific detail not in the summary** → one retrieval call, fresh chunks loaded into context.
- **Repeating a recent detail question** → often answered from chunks already in context (no new retrieval).

In a developed system you can observe this directly: a "Reading document" indicator appears when retrieval runs, and is absent when the model answers from context it already has.

## What This Looks Like End To End

```text
Upload time:
  PDF ──► Upload Router ──► Knowledge Store (chunks + index)
                        └─► Workspace State (summary + pointer)

Query time:
  User prompt
     │
     ▼
  Planner reads Workspace State (sees doc summary)
     │
     ├─ summary enough? ──► build brief, done
     └─ need detail?     ──► search_project_docs tool ──► chunks ──► use in brief
     │
     ▼
  Art Director, Implementor read Workspace State
     │
     ▼
  (rarely) any agent can call search_project_docs again if needed
```

## Key Properties

- The PDF is **chunked once**, at upload, with each chunk tagged `{ source, page, chunkId }`.
- The summary is generated implicitly at upload time so the model has immediate awareness of the file (the "reading document" step).
- The summary lives in Workspace State so agents have free awareness without retrieval cost.
- Retrieval is a **tool call**, fired on demand, not pre-run on every user turn and not per paragraph.
- Citations are produced by the model attaching chunk metadata that is already in context — one retrieval call can power many cited paragraphs.
- Once facts are extracted into the brief or styleContext, downstream agents work from Workspace State and rarely touch the PDF again.
- No cross-session memory — if the user starts a new project, they re-upload.

This matches how Claude Projects and ChatGPT custom GPTs handle attached files: the file is indexed once, the model gets a summary by default, and deeper retrieval is a tool the model can choose to use.
