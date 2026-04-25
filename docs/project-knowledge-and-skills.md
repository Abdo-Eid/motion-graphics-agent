# Project Knowledge, Uploads & Skills

This project treats uploaded knowledge as **per-session project knowledge**, not as long-term user memory. Each project session is self-contained.

The model is:

- The user provides files, docs, assets, or data.
- An **upload router** classifies each file at upload time.
- Most files are summarized or structured into **Workspace State** directly.
- Only large unstructured documents go into the **Project Knowledge Store** (chunked + indexed) for on-demand retrieval.
- **Skills** are a separate staged-loading system, not part of the knowledge store.

This gives immediate value from the first project without over-engineering retrieval.

---

## Core Principle

Not every file should go through the same pipeline.

- Small text should be inlined directly into Workspace State.
- Large PDFs and long text should be chunked + indexed into the Knowledge Store.
- CSV should be treated as structured data to execute against, not embedded.
- Images should branch into understanding mode (one-turn) or asset mode (Workspace State entry).
- Skills should use staged loading, not broad preload.

---

## Three Project State Layers

This project has three project-scoped state layers. The separation keeps each focused.

### What each one answers

- **Conversation Context** — "What was just said in this session?"
- **Workspace State** — "What is the current state of this project right now?"
- **Project Knowledge Store** — "What facts can we look up from large uploaded documents?"

There is no cross-session or user-level memory. Each project starts fresh.

### Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Conversation Context                       │
│  recent chat turns (with rolling summary when long)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Workspace State                           │
│                                                                 │
│  brief              ── current project goal and constraints     │
│  styleContext       ── current visual language                  │
│  sceneRegistry      ── per-scene design, status, files, errors  │
│  routing            ── Planner's classification of last request │
│  assets[]           ── typed asset list with metadata + paths   │
│  dataSummaries[]    ── derived facts from CSV execution         │
│  documentSummaries[]── summaries + pointers into Knowledge Store│
│  errors             ── latest typecheck/render failures         │
│                                                                 │
│  Source of truth for the active project. Mutable.               │
└──────────────────────────────┬──────────────────────────────────┘
                               │ tool call (only when summary
                               │ doesn't have the needed fact)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Project Knowledge Store                       │
│                                                                 │
│  large doc chunks ──► vector index (queried via tool)           │
│  raw upload files (read-only)                                   │
│  CSV execution store (SQLite/dataframe)                         │
│                                                                 │
│  Heavy content. Re-queryable, append-only per session.          │
└─────────────────────────────────────────────────────────────────┘
```

### How they connect

1. **Workspace State is the default.** Agents read it directly. Most upload pipelines populate Workspace State (assets, summaries, derived facts) so agents have free awareness without retrieval cost.
2. **The Knowledge Store is tool-triggered.** Retrieval runs only when an agent decides it needs a fact not already in Workspace State. It is not pre-fetched on every user message.
3. **Conversation Context wraps everything.** Each agent run includes recent chat turns alongside Workspace State.

### Rule of thumb

| Question | Use |
|---|---|
| What did the user just say? | Conversation Context |
| What is the current styleContext? | Workspace State |
| What assets are available? | Workspace State |
| What facts did we extract from the uploaded CSV? | Workspace State (`dataSummaries`) |
| What does page 23 of the brand guide say exactly? | Knowledge Store via retrieval tool |
| Which scenes have errors right now? | Workspace State |
| How did the Planner route the last edit? | Workspace State (`routing`) |

The Workspace State structure is documented in [`editing agent.md`](editing%20agent.md#workspace-state-structures).

---

## Upload Router

The first decision on any upload is by type and size.

```text
incoming file
  |- text file, small (< ~4K tokens)  -> inline into Workspace State
  |- text file, large                 -> chunk -> embed -> Knowledge Store
  |                                     + summary into Workspace State
  |- PDF                              -> extract -> chunk -> embed -> Knowledge Store
  |                                     + summary into Workspace State
  |- CSV
  |   |- tiny                         -> inline as text into Workspace State
  |   `- analytical                   -> parse -> SQLite/dataframe in execution store
  |                                     + schema/sample/summary into Workspace State
  `- image
       |- understanding mode          -> multimodal input or VLM-to-text in Conversation Context
       `- asset mode                  -> VLM metadata extraction
                                        + typed asset entry in Workspace State
```

End-to-end traces for each type are in [`pdf-upload-walkthrough.md`](pdf-upload-walkthrough.md) and [`upload-walkthroughs.md`](upload-walkthroughs.md).

---

## 1. Small Text / Manageable Files

**Trigger:** extracted text is under about `4K` tokens.

Use the simplest path:

- read the file directly
- inline the full content into Workspace State
- skip chunking, embeddings, and retrieval overhead

This should be the default when the file is small enough.

---

## 2. PDF / Large Text

**Trigger:** file is a PDF, or text is too large to inline directly.

This is the only path that uses the Knowledge Store.

### At ingest

1. Extract the text.
2. Chunk it with overlap. Each chunk is tagged with metadata: `{ source, page, chunkId }`.
3. Embed the chunks.
4. Store them in the Knowledge Store with the metadata.
5. Generate a structured summary of the full document (key points, tone, terminology, color/style mentions).
6. Store the summary in Workspace State along with a pointer into the Knowledge Store.

The summary covers most everyday questions. Retrieval is the fallback.

### At query time

1. An agent reads the summary from Workspace State first.
2. If the summary is sufficient, the agent uses it and moves on. No retrieval.
3. If a specific detail is needed, the agent calls `search_project_docs(query, knowledgeStoreId)`.
4. Top-K chunks are returned to the agent for that turn. They are not duplicated into Workspace State.

Retrieval fires **at most once per turn**, never per paragraph. Citations are produced by attaching chunk metadata that is already in context — the model does not call a tool per cited claim.

---

## 3. CSV

**Trigger:** file is a `.csv`.

CSV is **not** a classic RAG case. Do not embed raw rows.

### At ingest

- Parse into a dataframe or temp SQLite table in the execution store.
- Store schema, row count, and a small sample row set in Workspace State.
- Optionally compute lightweight summary stats (min/max/mean/distinct) in Workspace State.

### At query time

- Agent reads schema, sample, and summary from Workspace State.
- For specific facts, agent calls `run_data_query(executionStoreId, intent)`.
- The tool either lets the model write SQL/Python that runs in the sandbox, or uses a constrained query interface.
- The result is small and structured (e.g. `{ before: 14.2, after: 22.7, delta: '+59.9%' }`).
- The result is appended to `dataSummaries` in Workspace State and used to shape the brief.

### Tiny CSV exception

If the CSV is small enough to inline (a dozen rows or so), put the raw text into Workspace State and skip the execution pipeline.

### Why this matters

If a user uploads analytics data and says:

> "Make an animation explaining the trend"

the useful path is:

- parse the CSV
- compute the important facts via execution
- store the **derived facts** in Workspace State
- let the Planner and Art Director build the story from those facts

The value is in execution and storing the analysis output, not in embedding raw rows.

---

## 4. Images

Images have two different purposes. Choose the route at upload time.

### Understanding Mode

Use this when an agent needs to reason about what is in the image (a reference screenshot, a sketch, a "make something like this" example).

- Multimodal model: pass the image directly as an image input block on the current turn.
- Text-only model: run the image through a VLM once, inject the description into context.

Either way, the image (or its description) lives in **Conversation Context** for the relevant turn. It is not stored as a permanent Workspace State entry unless the user wants to keep it as a reference artifact.

### Asset Mode

Use this when the image is an input asset for the project (logo, brand illustration, product screenshot).

#### At ingest

- Run a VLM **once** to extract structured metadata.
- Store the metadata as a typed asset entry in Workspace State.
- Keep the original file path (read-only uploads area).

Example asset entry in Workspace State:

```json
{
  "name": "logo-dark",
  "path": "/uploads/logo-dark.png",
  "role": "logo",
  "description": "Primary brand logo, dark variant",
  "colors": ["#000000", "#FFD700"],
  "detectedText": "Brand Name",
  "style": "minimal, high contrast",
  "hasTransparency": true
}
```

#### At query time

- Agents read the asset list from Workspace State directly.
- The Implementor references the file path when generating code.
- No retrieval call. No re-running the VLM.

The VLM should not be re-run unless the file changes. For 1–10 assets, a typed list in Workspace State is enough — no vector index needed.

---

## 5. Read-Only Upload Directory

Uploaded files are source inputs, not working files.

Recommended layout:

```text
/mnt/user-data/uploads/     <- read-only user input
/home/agent/working/        <- scratch space for extracted outputs
/mnt/user-data/outputs/     <- final deliverables
```

Example:

```text
/mnt/user-data/uploads/
  brief.pdf
  logo.png
  data.csv

/home/agent/working/
  brief_chunks.json
  brief_summary.txt
  logo_metadata.json
  data.sqlite

/mnt/user-data/outputs/
  result.mp4
```

Rules:

- never write back into the uploads directory
- copy or transform into working storage first
- keep both the raw file and the processed representation

On startup, or whenever new files arrive, the upload router scans the upload directory and routes each file into the correct pipeline based on type and size.

This answers the practical question of "where do uploaded files live?"

- raw user files stay in uploads
- chunks, embeddings, and CSV execution stores stay in working storage (the Knowledge Store / execution store)
- structured summaries and derived facts go into Workspace State
- generated deliverables go into outputs

---

## 6. Generated Project Artifacts

Beyond uploads, the project also produces artifacts during the session: the brief, scene designs, generated source files, verification errors.

These all live in **Workspace State**, not the Knowledge Store. They are:

- Brief
- `styleContext`
- `sceneRegistry` (each scene's design, status, file path, errors)
- Routing decisions

Follow-up requests like "make scene 2 feel more energetic" or "fix the scene that failed typecheck" are answered by reading Workspace State directly. No retrieval is needed for current-project artifacts.

---

## 7. Skills — Staged Loading

Skills are short implementation guides for the Implementor. They are not part of the Knowledge Store and not part of the upload router.

### Indexing

The index can live in `SKILL.md` frontmatter.

Example:

```yaml
---
name: remotion-kinetic-text
description: Generates kinetic typography animations in Remotion.
             Use when the user asks for text-based motion, titles, or word-by-word reveals.
---
```

That frontmatter is enough to build an in-memory skill index.

### Recommended tool set

For MVP, the skill system only needs:

1. `search_skills(query)`
2. `load_skill(name)`
3. normal file `read`

Do **not** add `read_skill_resource(...)` yet. Mainstream agents usually load `SKILL.md` and use a normal read tool for referenced files. Adding more tools increases surface area without adding capability.

### Runtime flow

```text
1. Implementor task arrives
2. agent -> search_skills("kinetic text animation")
3. agent -> load_skill("remotion-kinetic-text")
4. agent reads referenced files with normal read if needed
5. agent executes
```

### Main rule

- do not preload all skills
- load only the active skill
- use regular file reads for referenced examples, docs, or schemas
- rely on `SKILL.md` to point the agent deeper into the skill directory

This is simple, matches how mainstream agents work, and is good enough for MVP.

---

## Agent Responsibilities

### Planner

- Reads Workspace State (brief, summaries, assets, data summaries) by default.
- Calls retrieval into the Knowledge Store only when a needed fact isn't already in Workspace State.
- Owns the brief and routing.

### Art Director

- Reads brief, `styleContext`, asset list, and document summaries from Workspace State.
- Calls retrieval if a specific brand-guide detail is needed for scene design.
- Updates `styleContext` and scene design records.

### Implementor

- Reads scene design and `styleContext` from Workspace State.
- Uses the sandbox tools and skill loader.
- Rarely touches the Knowledge Store directly — the relevant facts are already encoded in `styleContext`.

---

## What We Are Not Doing In MVP

- No cross-session user memory. No "use my usual style across projects."
- No semantic search over raw CSV rows.
- No vector index for small artifact lists (assets, data summaries).
- No automatic retrieval on every user message.

Those may become useful later, but they are not part of the MVP design.

---

## Practical Summary

| Input | Condition | Pipeline | Lands In |
|---|---|---|---|
| Text file | Small | Inline directly | Workspace State |
| Text file | Large | Chunk → embed → retrieve on demand | Knowledge Store + summary in Workspace State |
| PDF | Any meaningful size | Extract → chunk → embed → retrieve + summary | Knowledge Store + summary in Workspace State |
| CSV | Tiny | Inline directly | Workspace State |
| CSV | Larger / analytical | Parse → SQLite/dataframe → execute | Execution store + derived facts in Workspace State |
| Image | Understanding | Multimodal input or VLM-to-text | Conversation Context for that turn |
| Image | Asset | VLM metadata extraction | Workspace State (typed asset entry) |
| Generated artifacts | Any | Built by agents | Workspace State |
| Skills | Any | `search_skills` → `load_skill` → `read` | Skill loader (separate) |

The repeated principle: **default to Workspace State; the Knowledge Store is the exception, used only for content too large to fit in context.**
