# Project Knowledge, Retrieval & Skills

This project should treat retrieval as a **current-project knowledge system**, not mainly as long-term user preference recall.

The useful first-session model is:

- user gives files, docs, assets, or data
- the system stores the raw inputs
- the system extracts lighter structured knowledge from them
- agents retrieve only the relevant parts when needed
- skills are loaded in stages, not preloaded wholesale

This gives immediate value from the first project.

---

## Core Principle

Not every file should go through the same pipeline.

- small text should usually be inlined directly
- large text and PDFs should use chunking and retrieval
- CSV should be treated as structured data to execute against
- images should branch into understanding mode or asset mode
- skills should use staged loading, not broad preload

---

## RAG vs Memory

This project has two complementary but distinct knowledge systems. Understanding the separation keeps retrieval focused and memory lean.

### What each one answers

- **RAG** — "What do we know from the files and data?" — retrieval over stored project knowledge.
- **Memory** — "What is the current state of this project right now?" — active working state that agents carry and update during the session.

### Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                         RAG (Retrieval)                         │
│                                                                 │
│  Uploaded docs ──► extracted summaries ──► vector DB           │
│  Parsed CSV   ──► executed queries    ──► analysis results     │
│  Images       ──► VLM metadata       ──► asset index           │
│  Current artifacts (brief, scene designs, verification errors)  │
│                                                                 │
│  Answers: "What do we know from the files/data?"               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    RAG feeds facts
                    into Memory
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Memory (Working State)                   │
│                                                                 │
│  Planner brief     ── current project goal and constraints      │
│  styleContext      ── current visual language (colors, type,    │
│                        transitions, animation feel)             │
│  sceneRegistry     ── per-scene design, status, file paths,    │
│                        and errors                               │
│  Errors            ── latest typecheck/render failures          │
│  Routing decisions ── Planner's classification for follow-ups   │
│                                                                 │
│  Answers: "What is the current state of this project right now?"│
└─────────────────────────────────────────────────────────────────┘
```

### How they connect

1. **RAG feeds facts into Memory.** When the Planner retrieves relevant facts from uploaded docs or parsed data, those facts are synthesized into the brief and stored in memory. Asset metadata from RAG shapes `styleContext`.
2. **Memory holds the active working state.** Agents read and write memory structures during the session. Memory does not duplicate raw source data — it holds the *current* derived state.
3. **RAG is re-queryable; Memory is mutable.** RAG indexes are append-only and queried on demand. Memory structures are overwritten in place as the project evolves.

### Rule of thumb

| Question | Use |
|---|---|
| "What did the user's brief say about audience?" | RAG |
| "What is the current styleContext?" | Memory |
| "What facts can we extract from the uploaded CSV?" | RAG |
| "Which scenes have errors right now?" | Memory |
| "What assets are available?" | RAG |
| "How did the Planner route the last edit?" | Memory |

The sections below describe the RAG pipelines in detail. Memory structures are documented in [`editing agent.md`](editing%20agent.md#rag-vs-memory).

---

## File Upload Router

The first decision on any upload is by type and size.

```text
incoming file
  |- text file, small (< ~4K tokens)  -> inline directly into context
  |- text file, large                 -> chunk -> embed -> vector DB
  |- PDF                              -> extract -> chunk -> embed -> vector DB
  |- CSV                              -> parse -> dataframe/SQLite -> execute
  `- image
       |- understanding mode         -> multimodal image input or VLM description
       `- asset mode                 -> extract metadata JSON -> embed -> vector DB
```

---

## 1. Small Text / Manageable Files

**Trigger:** extracted text is under about `4K` tokens.

Use the simplest path:

- read the file directly
- inject the full content into the prompt
- skip chunking, embeddings, and retrieval overhead

This should be the default when the file is small enough.

---

## 2. PDF / Large Text

**Trigger:** file is a PDF, or text is too large to inline directly.

### At ingest

1. Extract the text.
2. Chunk it with overlap.
3. Embed the chunks.
4. Store them with metadata such as:

```json
{
  "source": "brief.pdf",
  "page_number": 3,
  "chunk_index": 7,
  "session_id": "project-123"
}
```

5. Also generate and cache a structured summary of the full document.

That summary should usually capture:

- key points
- constraints
- important terminology
- tone or style notes

### At query time

1. Embed the user query.
2. Run nearest-neighbor search against stored chunks.
3. Re-rank the results.
4. Inject only the top few relevant chunks.

Use the cached summary for broad understanding and chunk retrieval for specifics.

---

## 3. CSV

**Trigger:** file is a `.csv`.

CSV is **not** a classic RAG case.

Do not embed raw rows and query them semantically by default. Treat CSV as structured data that the system can execute against.

### At ingest

- parse into a dataframe or temp SQLite table
- store schema and session metadata
- optionally compute lightweight summaries or derived facts

### At query time

- give the model the schema first, not the full raw table
- let the model write SQL or code to answer the question
- execute that code in the sandbox
- inject the result back into the prompt

### Exception

If the CSV is tiny, inline it directly as text and skip the execution pipeline.

### Why this matters

If a user uploads analytics data and says:

> "Make an animation explaining the trend"

the useful path is:

- parse the CSV
- compute or query the important facts
- retrieve the relevant analysis result
- let Planner and Art Director build the story from those facts

The value is in using the raw CSV for execution and retrieving the **analysis output**, not in embedding raw rows and asking the model to semantically search them.

---

## 4. Images

Images have two different purposes, and the route should be chosen up front.

### Understanding Mode

Use this when the agent needs to reason about what is in the image.

If the model is multimodal:

- pass the image directly as an image input block

If the model is text-only:

- run the image through a VLM once
- inject the description as text

### Asset Mode

Use this when the image is an input asset for the project, like a logo or visual reference.

#### At ingest

- run a VLM once to extract structured metadata
- store the metadata JSON
- keep the original file path
- embed the metadata JSON for retrieval

Example metadata:

```json
{
  "description": "Primary brand logo, dark variant",
  "colors": ["#000000", "#FFD700"],
  "style": "minimal, high contrast",
  "detected_text": "Brand Name",
  "elements": ["centered logo", "transparent background"],
  "source_path": "/mnt/user-data/uploads/logo.png"
}
```

#### At query time

- search for the asset by description or metadata
- inject the retrieved metadata
- reference the original file path when generating code

The VLM should not be re-run unless the file changes.

Using a consistent metadata-and-retrieval path for assets is worth it even when there is only one asset. It keeps the system stable if the user adds more later.

---

## 5. Read-Only Upload Directory

Uploaded files should be treated as source inputs, not working files.

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

On startup, or whenever new files arrive, the system should scan the upload directory and route each file into the correct pipeline based on type and size.

Examples:

- PDF -> retrieval pipeline
- large text -> retrieval pipeline
- tiny text -> inline directly
- tiny CSV -> inline directly
- larger CSV -> dataframe or SQLite pipeline
- images -> understanding mode or asset mode

This answers the practical question of "where do uploaded files live?"

- raw user files stay in uploads
- processed data goes in working
- generated deliverables go in outputs

---

## 6. Current-Project Retrieval

Beyond uploaded files, the project should also retrieve from artifacts generated during the current run.

Useful current-project retrieval targets:

- Planner brief
- `styleContext`
- `sceneRegistry`
- generated scene designs
- generated composition files
- latest verification errors and fixes

This helps with follow-up requests like:

- "make scene 2 feel more energetic"
- "keep the same style but shorten the intro"
- "fix the scene that failed typecheck"

This is retrieval over active project state rather than long-term user history.

---

## 7. Skills — Staged Loading

Skills are related, but they are not the same thing as retrieval over user-provided project data.

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

Do **not** add `read_skill_resource(...)` yet.

Why:

- mainstream agents usually just load `SKILL.md` and then use a normal read tool for referenced files
- `read_skill_resource` mostly duplicates generic read capability
- extra tools increase surface area without adding a fundamental capability

### Runtime flow

```text
1. user request arrives
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

### Limitation

This approach means the agent may sometimes read more of a support file than it strictly needs, or miss files that `SKILL.md` does not mention clearly. That is acceptable for now and is usually a better tradeoff than adding more tool complexity too early.

---

## Agent Responsibilities

### Planner

- uses uploaded project knowledge to create better briefs
- uses current-project artifacts for routing and follow-up edits
- should be the main consumer of retrieved document and data context

### Art Director

- uses retrieved project facts and asset metadata for scene design
- updates `styleContext` and scene design outputs

### Implementor

- uses retrieved project context only when it affects implementation
- primarily relies on sandbox files, skills, and current scene design inputs

---

## What We Are Not Optimizing For Yet

This doc intentionally does **not** center the system on:

- long-term cross-session user preference memory
- "use my usual style" as the main retrieval story
- semantic search over raw CSV rows

Those may still become useful later, but they should not drive the MVP design.

---

## Practical Summary

| Input | Condition | Pipeline |
|---|---|---|
| Text file | Small | Inline directly |
| Text file | Large | Chunk -> embed -> retrieve |
| PDF | Any meaningful size | Extract -> chunk -> embed -> retrieve + summary |
| CSV | Tiny | Inline directly |
| CSV | Larger / analytical | Parse -> dataframe or SQLite -> execute query/code |
| Image | Understanding | Multimodal input or VLM description |
| Image | Asset | Metadata extraction -> embed -> retrieve |
| Current project artifacts | Any | Retrieve from brief, scene data, file state, and errors |
| Skills | Any | `search_skills` -> `load_skill` -> normal `read` |

This is the retrieval model that gives value from the first project, not only after the system has built long-term user history.
