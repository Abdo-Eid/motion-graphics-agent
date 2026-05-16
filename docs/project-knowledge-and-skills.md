# Project Knowledge & Skills

This project treats uploaded knowledge as **per-session project knowledge**, not as long-term user memory. Each project session is self-contained.

This doc covers the *principles*: state layers, retrieval rules, agent responsibilities, the skills system, and the MVP cuts. For step-by-step traces of what happens per file type at upload time, see [`upload-walkthroughs.md`](upload-walkthroughs.md).

---

## Project State Layers

Three project-scoped state layers, no cross-session or user-level memory:

- **Conversation Context** — chat thread + Mastra Observational Memory (auto-compresses old turns).
- **Workspace State** — `brief`, `styleContext`, `sceneRegistry`, `assets[]`. Schema in [`../tasks/T1A-memory-and-state.md`](../tasks/T1A-memory-and-state.md).
- **Project Knowledge Store** — `LibSQLVector` index for large unstructured docs, partitioned by `projectId`.

Canonical layer definitions and ownership rules: [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md#project-state-layers).

```text
                          ┌─────────────────────────┐
        user turn ──────▶ │  Conversation Context   │ ◀── Observational
                          │  (chat thread + memory) │     Memory compresses
                          └────────────┬────────────┘     old turns
                                       │
                       reads/writes    │
                                       ▼
   ┌──────────────┐       ┌─────────────────────────┐       ┌──────────────┐
   │   Planner    │ ────▶ │     Workspace State     │ ◀──── │ Art Director │
   │ (brief)      │       │  brief · styleContext   │       │ (styleContext│
   └──────────────┘       │  sceneRegistry · assets │       │  scene design│
          │               └────────────┬────────────┘       └──────────────┘
          │                            │ read-only
          │                            ▼
          │                    ┌──────────────┐
          │                    │ Implementor  │  no writes, no retrieval
          │                    └──────────────┘
          │
          │  on demand, max 1×/turn
          ▼
   ┌─────────────────────────┐
   │ Project Knowledge Store │  large docs, chunked + embedded
   │ (LibSQLVector)          │  partitioned by projectId
   └─────────────────────────┘
          ▲
          │  also queryable by Art Director
          └────────────── (Implementor never queries it)
```

The principle: **default to Workspace State; the Knowledge Store is the exception, used only for content too large to fit in context.**

---

## Retrieval Rules

- Only **Planner** and **Art Director** call `retrieveProjectKnowledge`. The Implementor has no retrieval tool.
- Retrieval is **on demand**, **at most once per turn**. Never per paragraph, never automatically on every user message.
- Retrieved chunks inform the current turn (brief refinement, scene design); they are **not** mirrored into Workspace State.
- For current-project artifacts (brief, styleContext, scene designs, assets), agents read Workspace State directly — no retrieval needed.

For per-input-type ingest mechanics (PDF chunking, CSV file copy, image `kind` dispatch, fonts), see [`upload-walkthroughs.md`](upload-walkthroughs.md).

---

## Filesystem Layout

The Mastra server owns one local workspace folder. Upload handlers and Implementor tools write to different parts of that folder:

```text
<workspace>/
  assets/      <- main app writes (image asset uploads only)
  uploads/     <- main app writes (CSV uploads)
  src/         <- Implementor writes generated Remotion code
  out/         <- Implementor/check commands write rendered video or build artifacts
```

Rules:

- Upload handlers write to `assets/` and `uploads/`.
- Implementor writes generated code under `src/` and may produce build artifacts under `out/`.
- Implementor treats raw uploads and source assets as inputs. It should not mutate uploaded files in place.
- Raw uploads are inputs, not working files; the Implementor copies or transforms before mutating.
- The Knowledge Store (chunks + embeddings) lives in the LibSQL DB at `mastra/mastra.db`, not on disk under the workspace.

The workspace-root path should be resolved by the Mastra server. `WORKSPACE_PATH` can override it; otherwise use `mastra/.workspace`, which is tracked by the main repo and reset to the committed baseline on each `dev:mastra` start. The LibSQL URL is hardcoded as `file:./mastra.db` in both `mastra/src/mastra/memory/index.ts` and `mastra/src/mastra/knowledge/store.ts`. Neither requires an env var.

---

## Generated Project Artifacts

Beyond uploads, the project produces artifacts during the session:

- **Brief** — Workspace State (`brief`), written by the Planner.
- **`styleContext`** — Workspace State, written by the Art Director.
- **`sceneRegistry[n].design`** — Workspace State, written by the Art Director. The schema deliberately holds only `{ number, name, design }` per scene.
- **Scene status, source file paths, build errors** — **not** in working memory. Changed files live on the filesystem under `src/` and `out/`, while transient implementation status is reported naturally in chat and activity events.
- **Plan / scene-by-scene outline** — lives in the chat message stream, not as a persisted field. Observational Memory compresses it over time; the brief in working memory remains the durable record.

Follow-up requests like "make scene 2 feel more energetic" are answered by reading Workspace State and current project files; no retrieval is needed for current-project artifacts.

---

## Agent Responsibilities

Field ownership is enforced by the role-guarded helpers in `mastra/src/mastra/memory/access.ts` — wrong-role writes throw and emit `field-ownership-violation` on the bus.

### Planner (Supervisor)

- Reads Workspace State (brief, styleContext, sceneRegistry, assets) by default.
- Calls `retrieveProjectKnowledge` only when a needed fact isn't already there.
- Owns the brief; sets it via the role-guarded `setBrief` tool.
- **Dispatches** Art Director and Implementor via Mastra's auto-generated subagent tools (`agent-artDirector`, `agent-implementor`). No separate orchestrator — see [`../tasks/T2-planner-agent.md`](../tasks/T2-planner-agent.md).
- Plan lives in chat (natural language), not in working memory.

### Art Director

- Reads brief, `styleContext`, scene context, and `assets[]` from Workspace State.
- Calls `retrieveProjectKnowledge` if a specific brand-guide detail is needed for scene design.
- Writes `styleContext` (`setStyleContext`) and per-scene `design` (`setSceneDesign`).

### Implementor

- Reads `styleContext` and `sceneRegistry[n].design` from Workspace State (read-only — no memory-write tools).
- Uses Mastra Workspace tools and the skill loader.
- Has no retrieval tool. The relevant facts are already encoded in `styleContext` and the scene design.

---

## Skills — Staged Loading

Skills are short implementation guides for the Implementor. They are **not** part of the Knowledge Store and **not** part of the upload router. They should live in a Mastra-owned skills directory and be loaded on demand.

### Indexing

The index can live in `SKILL.md` frontmatter:

```yaml
---
name: remotion-kinetic-text
description: Generates kinetic typography animations in Remotion.
             Use when the user asks for text-based motion, titles, or word-by-word reveals.
---
```

That frontmatter is enough to build an in-memory skill index at server startup.

### Recommended tool set

For MVP:

1. `search_skills(query)`
2. `load_skill(name)`
3. normal file `read` (provided by the Implementor's workspace tool surface)

Do **not** add `read_skill_resource(...)` — mainstream agents load `SKILL.md` and use a normal read tool for referenced files. Adding more tools increases surface area without adding capability.

### Runtime flow

```text
1. Implementor task arrives
2. agent -> search_skills("kinetic text animation")
3. agent -> load_skill("remotion-kinetic-text")
4. agent reads referenced files with the workspace read tool if needed
5. agent executes
```

### Main rule

- Do not preload all skills.
- Load only the active skill.
- Use regular file reads for referenced examples, docs, or schemas.
- Rely on `SKILL.md` to point the agent deeper into the skill directory.

---

## What We Are Not Doing In MVP

- No cross-session user memory. No "use my usual style across projects."
- No vector index for small artifact lists (assets, scene records).
- No automatic retrieval on every user message — retrieval is on demand only, max once per turn.

For upload-specific cuts (no PDF auto-summary, no CSV parsing pipeline, no VLM-at-upload), see [`upload-walkthroughs.md`](upload-walkthroughs.md#out-of-scope-for-t1).

These may become useful later; they are not part of the MVP.
