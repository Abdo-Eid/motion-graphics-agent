# Phase 3 — T1 — Memory, Knowledge, Uploads (Overview)

T1 is the data spine the three agents read and write through. It splits cleanly into two parallelizable tracks with disjoint files and one schema-level coordination point.

## Tracks

- **[T1A — Memory & Workspace State](phase-3-memory-and-state.md)** — Mastra `Memory` (working memory + Observational Memory), the `WorkspaceState` zod schema, and the role-guarded setter tools (`setBrief`, `setStyleContext`, `setSceneDesign`, `addAsset`). Owns `mastra/src/mastra/memory/`.
- **[T1B — Knowledge Store & Uploads](phase-3-knowledge-and-uploads.md)** — `LibSQLVector` knowledge index, embedding pipeline, `retrieveProjectKnowledge` tool, and the `POST /uploads` + status SSE routes with per-type handlers. Owns `mastra/src/mastra/knowledge/` and `mastra/src/mastra/uploads/`.

Each track has its own scope, files, env vars, and checkpoints. Read the track file for implementation detail.

## Layers At A Glance

- **Workspace State** — structured, mutable project state (`brief`, `styleContext`, `sceneRegistry`, `assets`). Stored as Mastra working memory with a zod schema; mutated only through Track A's role-guarded tools. (T1A)
- **Conversation Context** — chat thread per session, with Observational Memory compressing old turns. (T1A)
- **Project Knowledge Store** — vector-indexed chunks from large uploads. Separate from Mastra Memory. Used only when a fact is needed that doesn't live in Workspace State. (T1B)
- **Upload handler** — turns raw user files into assets, Knowledge Store chunks, and Workspace State entries. (T1B)

## Coordination Points (Read Before Splitting)

1. **`Asset` zod schema.** Defined in T1A's `memory/schema.ts`, consumed by T1B's upload handlers. Lock the exact shape together before either side codes against it.
2. **`addAsset` tool.** T1A exports it; T1B's handlers call it. T1B can stub locally during parallel work and swap to the real import at merge.
3. **`projectId` propagation.** Used as both `threadId` and `resourceId` for memory writes, and as the partition key for the Knowledge Store. Multipart `POST /uploads` provides it; both tracks must use the same value end to end.
4. **`LIBSQL_URL`.** One DB file at `mastra/data/motion-graphics-agent.db`. Track A creates `LibSQLStore` against it; Track B creates a separate `LibSQLVector` against the same URL. No contention, but agree on the env var name.
5. **`mastra/src/mastra/index.ts` wiring.** The final `new Mastra({ storage, agents, apiRoutes, tools })` call combines outputs from both tracks. Assign one owner for the merge step.

## Suggested Split

- **Person on T1A** — comfortable with Mastra internals (working memory schema mode, scopes, readOnly semantics, Observational Memory triggers). Smaller LOC, higher "did you read the docs right" weight.
- **Person on T1B** — comfortable with file I/O, multipart parsing, streaming/SSE, embeddings. Larger LOC, more moving parts.

## Solo Path

If working solo: do T1A first end-to-end (checkpoints 1–2 green), then T1B (checkpoints 3–5 green). The schema lock and `addAsset` shape are still worth pinning down before starting T1B.

## Reference

- [`phase-3-memory-and-state.md`](phase-3-memory-and-state.md) — Track A spec
- [`phase-3-knowledge-and-uploads.md`](phase-3-knowledge-and-uploads.md) — Track B spec
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — main consumer of memory helpers and `retrieveProjectKnowledge`
- [`phase-3-art-director-agent.md`](phase-3-art-director-agent.md) — secondary retrieval consumer
- [`phase-3-implementor-agent.md`](phase-3-implementor-agent.md) — pure consumer of working memory; gets neither setter tools nor retrieval
