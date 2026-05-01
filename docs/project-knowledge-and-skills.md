# Project Knowledge, Uploads & Skills

This project treats uploaded knowledge as **per-session project knowledge**, not as long-term user memory. Each project session is self-contained.

The model is simple:

- The user uploads files (images, PDFs, CSVs, text, assets).
- An **upload handler** copies files and writes them to `uploads/` folder.
- For large documents, the handler also chunks and indexes them into the **Project Knowledge Store** (vector index).
- For reference images, the handler normalizes them to a content block and hands them to the Planner with the message.
- The **Planner decides** whether an image is an asset (save to Workspace State) or a reference (stays in conversation thread only).
- **Skills** are indexed at server startup and available through the same retrieval tool as user docs.

---

## Two Project State Layers

This project has two project-scoped state layers:

1. **Workspace State** — structured project state: `brief`, `styleContext`, `sceneRegistry`, `assets[]`
2. **Project Knowledge Store** — vector index for large documents and implementation reference (Remotion API, skills)

There is no cross-session or user-level memory. Each project starts fresh.

### Diagram

```text
┌────────────────────────────────────────┐
│        Conversation Context            │
│  (Mastra thread memory, no custom     │
│   summarizer; recent turns only)       │
└────────────┬─────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│       Workspace State                  │
│                                        │
│  brief ─ Planner writes                │
│  styleContext ─ Art Director writes    │
│  sceneRegistry ─ AD + Impl collaborate │
│  assets[] ─ upload pipeline writes     │
│                                        │
│  Source of truth. Structured.         │
└────────────┬─────────────────────────┘
             │
             ├─ generated code: scenes/*.tsx
             ├─ derived facts: notes/*.md
             ├─ raw files: uploads/
             │
             ▼
┌────────────────────────────────────────┐
│   Project Knowledge Store              │
│                                        │
│  User docs: chunks + vector index      │
│  Skills library: indexed at startup    │
│  Remotion API ref: indexed at startup  │
│                                        │
│  Queried via retrieveProjectKnowledge  │
│  by Planner, Art Director, Implementor│
└────────────────────────────────────────┘
```

### How they connect

1. **Workspace State is the default.** Agents read it directly for active project state.
2. **Workspace files are read with sandbox tools.** Generated code and derived facts live as files (`scenes/`, `notes/`).
3. **The Knowledge Store is tool-triggered.** Retrieval is called only when an agent needs facts from large documents or implementation reference. Not pre-fetched.
4. **Conversation Context holds chat.** Mastra thread memory, no custom summarizer.

### Rule of thumb

| Question | Where to look |
|---|---|
| What did the user just say? | Conversation Context |
| What is the current styleContext? | Workspace State |
| What assets are available? | Workspace State |
| What does page 23 of the brand guide say? | Knowledge Store via `retrieveProjectKnowledge(...)` |
| Which scenes have errors right now? | Workspace State |
| How do I use `interpolate` in Remotion? | Knowledge Store (Remotion API reference) |

The Workspace State structure is documented in [`editing agent.md`](editing%20agent.md#workspace-state-structures).

---

## Upload Handler

All uploads follow the same simple path:

```text
incoming file
  │
  ├─ copy to uploads/ folder
  │
  ├─ for large docs (PDF, large text)
  │  └─ extract → chunk → embed → store in Knowledge Store
  │
  ├─ for images (if intended as asset)
  │  └─ write description (multimodal or VLM) → add to assets[] in Workspace State
  │
  ├─ for images (if reference/understanding)
  │  └─ normalize to content block → attach to user message
  │
  └─ for other files (CSV, text, etc.)
     └─ stay in uploads/, agent reads on demand
```

The Planner determines reference vs asset intent from the user's message context, not heuristic classification.

---

## Large Documents (PDF, Long Text)

**Trigger:** file is a PDF or extracted text is too large to reason about in a single turn.

### At ingest

1. Extract text
2. Chunk with overlap (~500 tokens per chunk, ~50 token overlap)
3. Tag chunks with metadata: `{ source, page, chunkIndex }`
4. Embed chunks
5. Store in Knowledge Store

**No summary stored in Workspace State.** Agents query directly when needed.

### At query time

- Agent calls `retrieveProjectKnowledge({ query, k })`.
- Top-K chunks returned with metadata attached.
- Agent uses chunks for this turn. Not duplicated into Workspace State.

Retrieval fires **at most once per turn**, on demand only.

---

## CSV Data

**Trigger:** file is a `.csv`.

### At ingest

- Copy to `uploads/` folder
- That's it — no parsing, no summary

### At query time

If an agent needs facts:
1. Implementor writes a small analysis script in the sandbox
2. Runs the script against the CSV
3. Saves result to `notes/data-facts.md`
4. All agents read the results as a markdown file

CSV is structured data. Query it with code, not embeddings.

---

## Images — Single Drop Zone, Planner Classifies

Images always normalize to a content block first (multimodal or VLM description). The Planner reads the user's message + image and decides.

### Reference Image

User says *"make something like this"* or *"here's a reference"*

- Image stays in conversation thread
- Not saved to `uploads/`
- Not added to `assets[]`
- Agent sees it for this turn only

### Asset Image

User says *"use this logo"* or *"here's our brand illustration"*

- Copy to `uploads/` folder
- Write description (multimodal or VLM) once at upload time
- Add `Asset` entry to Workspace State:

```ts
{
  id: "logo-dark-1",
  path: "uploads/logo-dark.png",
  description: "Primary brand logo, dark variant, transparent background..."
}
```

- Implementor reads the path and uses it in code
- All agents read the description

No agent re-processes the image. The description, written once, serves all.

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

### Planner (Supervisor)

- Reads Workspace State (brief, summaries, assets, data summaries) by default.
- Calls retrieval into the Knowledge Store only when a needed fact isn't already in Workspace State.
- Owns the brief and routing classification.
- **Dispatches** the Art Director and Implementor directly via subagent tools (`delegateToArtDirector`, `delegateToImplementor`). There is no separate orchestrator — see [`../tasks/phase-3-planner-agent.md`](../tasks/phase-3-planner-agent.md).

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
