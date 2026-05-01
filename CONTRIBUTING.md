# Contributing Guide

How to pick up work on this repo. Read [`AGENTS.md`](AGENTS.md) first if you (or your AI assistant) will be writing code — it sets the rules of engagement (teach-first, minimal correct code, no Docker, official docs only).

This document is the **work board**: every task, what it depends on, whether you can start it today, who owns the files, and the first command to run.

---

## TL;DR

- Three Bun workspaces: `web/` (port 3000), `mastra/` (port 4111), `sandbox/` (port 4311)
- Run everything: `bun run dev`. Run one: `bun run dev:web` / `dev:mastra` / `dev:sandbox`
- Spec for every task lives in `tasks/phase-*.md`. **Read the spec before writing code.**
- Architecture rules that aren't negotiable: see `AGENTS.md` → "Architecture Constraints".

---

## Repo Map (Where Things Live)

| Path | What it is |
|---|---|
| `web/` | Vite + React + Tailwind v4 + TanStack Router/Query + AI SDK React. Frontend shell + integration. |
| `mastra/` | Mastra agent server. Agents, memory, knowledge store, uploads, MCP client, SSE event bus, workspace read-through routes. |
| `sandbox/` | Standalone Bun MCP service. File + exec tools the Implementor uses. No Docker. |
| `tasks/` | One task spec per file. Source of truth for scope. |
| `docs/` | Architecture and design docs. `docs/reference/` is frozen historical context — don't implement against it. |
| `PROJECT_OVERVIEW.md` | Product vision + system diagram. |
| `AGENTS.md` | Rules for AI coding agents. Humans should still skim it. |

---

## Phase Overview

| Phase | What | Status |
|---|---|---|
| 1 | Monorepo scaffold (Bun workspaces, Vite, Mastra CLI, env) | done |
| 2 | Frontend shell — 4-panel layout (`tasks/phase-2-frontend.md`) | **done (static, mock data — not integrated)** |
| 3 | Mastra backend (memory, agents, delegation tools, sandbox, MCP+skills) | not started |
| 4 | Frontend integration — wire static shell to live backend (`tasks/phase-4-frontend-integration.md`) | not started |
| 5 | End-to-end smoke (no task file — just run `bun run dev` and follow the checkpoint in `docs/SETUP_GUIDE.md`) | not started |

> **Phase 2 status note.** The shell is built. `web/src/` already has `chat-panel.tsx`, `player-panel.tsx`, `agent-log.tsx`, `bottom-panel.tsx`, `topbar.tsx`, `mock-product-tour.tsx`, plus mock fixtures in `web/src/data/mock-data.ts`. Phase 4 replaces the mock data sources with real backend wiring — it does **not** rebuild the components.

---

## Dependency Graph (Phase 3)

> Architecture: Planner is the supervisor. The Art Director and Implementor are subagents invoked through delegation tools the Planner owns. There is no separate orchestrator.

```
                ┌──────────────────────────┐
                │ T1 Memory + Knowledge    │  data spine
                │   + Uploads              │  (blocks 2,3,4,6,7)
                └─────────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ T3 Art Dir   │      │ T4 Implementor│     │ T2 Planner   │
 │  (subagent)  │      │  (subagent)  │      │ (supervisor +│
 └──────┬───────┘      └──────┬───────┘      │  delegation  │
        │                     │              │  tools + bus)│
        └─────────┬───────────┘              └──────┬───────┘
                  ▼                                 │
                  └─────────────────────────────────┘
                       Planner dispatches subagents

        ┌──────────────────┐         ┌──────────────────┐
        │ T7 MCP client    │ ◀────── │ T6 Sandbox svc   │  independent —
        │   + skills v1    │         │   (Bun process)  │  build in parallel
        └──────────────────┘         └──────────────────┘
                                              ▲
                                              │ shares SANDBOX_WORKSPACE_DIR
                                              │
                                     (T1 writes assets/ here)
```

What's parallel-safe:

- **T6 (Sandbox service)** has zero deps on other tasks. Start it day one alongside anything else. Its only contract with the main app is the MCP tool surface in `docs/local-sandbox-service-design.md`.
- **T3, T4 (Art Director and Implementor subagents)** can be built in parallel **after T1 lands** — each owns its own file under `mastra/src/mastra/agents/`.
- **Phase 2 frontend shell** is already done (static, mock-data).
- **Phase 4 frontend integration** depends on T1 + T2 + T6 + T7.

What's sequential:

- T1 must land first (every agent reads/writes through its access helpers).
- T2 (Planner / supervisor + delegation tools) needs T3 and T4 to exist (it dispatches into them). So in practice: T3 + T4 in parallel, then T2 wires them as subagents.
- T7 needs T6 reachable to prove discovery; skill markdown content can be written before T6 is done.

---

## Task Cards

Each card: **what · who can start · prereqs · files · how to begin · checkpoint**.

### T1 — Memory, Knowledge Store, Uploads

- **Spec**: `tasks/phase-3-memory-knowledge-uploads.md`
- **What**: Workspace State (zod schemas + LibSQL store + role-guarded access helpers), conversation rolling summarizer, Project Knowledge Store (LibSQL vector + chunker + embeddings + retrieval tool), upload pipeline (`POST /uploads` + per-type handlers).
- **Start now?** Yes. No prereqs.
- **Files** (all new): `mastra/src/mastra/memory/{schema,store,access,summarizer,index}.ts`, `mastra/src/mastra/knowledge/{store,embeddings,chunker,retrieve}.ts`, `mastra/src/mastra/uploads/{router,ingest}.ts`, `mastra/src/mastra/uploads/handlers/{pdf,csv,image,text,asset}.ts`.
- **Begin**: read the schema section + field-ownership table in the spec, then scaffold `memory/schema.ts` and `memory/store.ts` first. Wire one helper end-to-end (`setBrief`) before adding the rest.
- **Checkpoint**: 5 numbered tests at the bottom of the spec — memory roundtrip, summarization, PDF upload → DocumentSummary + chunks, logo upload → Asset + file copy, CSV → DataSummary.
- **Docs**: <https://mastra.ai/docs/memory/overview>, <https://mastra.ai/docs/rag/overview>, <https://docs.turso.tech/sdk/ts/quickstart>, <https://zod.dev>.

### T2 — Planner Agent (Supervisor) + Delegation Tools

- **Spec**: `tasks/phase-3-planner-agent.md`
- **What**: Three pieces shipped together. (a) The Planner agent — supervisor that owns user conversation, clarification, brief, routing classification, and **dispatches** subagents. (b) The two delegation tools (`delegateToArtDirector`, `delegateToImplementor`) that wrap `mastra.getAgent(...).generate(...)`. (c) A tiny in-process event bus (`server/bus.ts`) the Phase 4 SSE route subscribes to. Routing rules live in the Planner's instructions, not in code.
- **Start now?** Wires last — needs T1 (memory helpers + retrieval) and T3/T4 (subagents to dispatch into). Skeleton instructions and the bus can be drafted in parallel with everything else.
- **Files**: `mastra/src/mastra/agents/planner.ts`, `mastra/src/mastra/agents/delegations.ts`, `mastra/src/mastra/server/bus.ts`, `mastra/src/mastra/index.ts` (modify — register all three agents).
- **Begin**: build the bus first (10 lines around `EventEmitter`), then the two `createTool` wrappers, then the Planner agent with the routing table inline in its `instructions`. Register all three agents in `index.ts` to unlock the Phase 3 base checkpoint.
- **Checkpoint**: `POST /chat/plannerAgent` with a full prompt produces `delegate_to_art_director` and `delegate_to_implementor` tool calls in the trace; with a tweak prompt, only `delegate_to_implementor` fires. Bus emits matching `agent.start` / `agent.end`.
- **Docs**: <https://mastra.ai/docs/agents/overview>, <https://mastra.ai/docs/agents/agent-as-tools>, <https://ai-sdk.dev/docs/foundations/tools>.

### T3 — Art Director Agent

- **Spec**: `tasks/phase-3-art-director-agent.md`
- **What**: Creative-design agent. Brief → per-scene design (composition, hierarchy, animation feel, transitions, acceptance criteria). Owns `styleContext` and `sceneRegistry[n].design`. No code, no sandbox tools, no Remotion API names.
- **Start now?** After T1. Independent of T2/T4.
- **Files**: `mastra/src/mastra/agents/art-director.ts` (new), `mastra/src/mastra/index.ts` (modify).
- **Begin**: write the `instructions` to enforce feel-based language, attach `setStyleContext` + `setSceneDesign` helpers + `retrieveProjectKnowledge`.
- **Checkpoint**: `POST /chat/art-director-agent` produces scene designs without any `useCurrentFrame`/`spring` references.

### T4 — Implementor Agent

- **Spec**: `tasks/phase-3-implementor-agent.md`
- **What**: Execution agent. Reads scene design + styleContext, writes Remotion code, runs typecheck, fixes errors, updates scene status. **Only agent that gets sandbox tools.**
- **Start now?** Skeleton can start after T1. Tools wire up needs T6 (sandbox) + T7 (MCP client). Until then the agent answers descriptively, which is fine.
- **Files**: `mastra/src/mastra/agents/implementor.ts` (new), `mastra/src/mastra/index.ts` (modify).
- **Begin**: write `instructions` covering the Remotion conventions in the spec, then add the scene-status helpers from T1. Defer tool attachment to T7.
- **Checkpoint**: with sandbox + MCP wired, asks Implementor to list workspace and run `node --version` → it actually invokes `list_files` and `exec_command`.
- **Docs**: <https://www.remotion.dev/docs>, <https://mastra.ai/docs/tools-mcp/mcp-overview>.



### T6 — Sandbox Service

- **Spec**: `tasks/phase-3-sandbox-service.md` · **Design**: `docs/local-sandbox-service-design.md`
- **What**: Standalone Bun process at port 4311 exposing Mastra `MCPServer` over HTTP. Implements `read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `exec_command`, `exec_background`, `check_background`, `kill_background`, `run_typecheck`, `list_skills`, `load_skill`. All paths sandboxed under `SANDBOX_WORKSPACE_DIR` via a path guard.
- **Start now?** Yes — fully independent. Doesn't import from `mastra/`.
- **Files** (all new under `sandbox/`): `src/index.ts`, `src/server.ts`, `src/provider/{local-provider,path-guard,exec,background}.ts`, `src/tools/{read-file,write-file,edit-file,list-files,grep,exec-command,exec-background,check-background,kill-background,run-typecheck,list-skills,load-skill}.ts`. Replace the placeholder `sandbox/src/index.ts`.
- **Begin**: implement `path-guard.ts` first (everything else depends on it), then `exec.ts`, then the simplest tool (`read-file`) end-to-end before scaling out.
- **Checkpoint**: `bun run dev:sandbox` boots, `curl http://localhost:4311/mcp` returns the tool list, the smoke-test prompt in the spec creates `sandbox/.workspace/hello.txt`.
- **Docs**: <https://mastra.ai/docs/tools-mcp/mcp-overview>, <https://bun.sh/docs/runtime/shell>, <https://nodejs.org/api/child_process.html>.

### T7 — MCP Client + Skills v1

- **Spec**: `tasks/phase-3-mcp-client-and-skills.md`
- **What**: Two pieces shipped together. (a) `MCPClient` in main app pointing at `SANDBOX_MCP_URL`, attaches discovered tools to Implementor only, fails soft if sandbox is down. (b) Five skill markdown docs under `sandbox/skills/`: `remotion-basics.md`, `transitions.md`, `kinetic-typography.md`, `logo-reveal.md`, `chart-animation.md`.
- **Start now?**
  - Skill markdown content: yes, anytime. Pure writing, no code dep.
  - MCP client: needs T6 reachable for the discovery checkpoint, but can be coded against the spec's tool name list earlier.
- **Files**: `mastra/src/mastra/mcp/{client,index}.ts` (new), `mastra/src/mastra/agents/implementor.ts` (modify — accept tools), `mastra/src/mastra/index.ts` (modify), `sandbox/skills/*.md` (new).
- **Begin**: write the five skill docs first (good warm-up, unblocks T6's `list_skills` test). Then `mcp/client.ts` and pass tools into the Implementor factory.
- **Checkpoint**: Mastra startup logs the discovered 12 tool names; Implementor's `list_skills` returns 5 entries.
- **Docs**: <https://mastra.ai/docs/tools-mcp/mcp-overview>, <https://modelcontextprotocol.io>.

---

### Phase 2 — Frontend Shell · **already built (static)**

- **Spec**: `tasks/phase-2-frontend.md`
- **What was built**: Full-viewport dark UI with chat, preview, activity, and bottom panels. Currently driven by mock data — no backend calls yet.
- **Existing files** in `web/src/`:
  - `App.tsx`, `main.tsx`, `theme/themes.ts`
  - `components/topbar.tsx`, `chat-panel.tsx`, `chat-message.tsx`, `player-panel.tsx`, `agent-log.tsx`, `bottom-panel.tsx`, `mock-product-tour.tsx`
  - `data/mock-data.ts` ← this is the seam Phase 4 replaces
- **What's left**: nothing as a separate task. Any layout tweaks happen inside Phase 4 when each panel is wired to its real data source.
- **If you want to run it now**: `bun run dev:web` — shell renders at `localhost:3000` against mock data.

### Phase 4 — Frontend Integration

- **Spec**: `tasks/phase-4-frontend-integration.md`
- **Starting point**: the static shell in `web/src/` (Phase 2 done). The job is to **replace the mock data sources** with real backend wiring — keep the components, swap the data they read.
- **Mock-data seam**: `web/src/data/mock-data.ts` is currently consumed by `agent-log.tsx`, `bottom-panel.tsx`, `chat-panel.tsx`, and `mock-product-tour.tsx`. Each consumer gets migrated to a real source as its corresponding backend piece lands.
- **What**: Wire the static shell to a live backend. Five sub-parts:
  - **A** SSE activity stream (`GET /events/:projectId`) + in-process event bus (`mastra/src/mastra/server/events.ts`, `bus.ts`).
  - **B** Workspace read-through routes (`GET /workspace/files`, `GET /workspace/file`) + fs watcher emitting `workspace.file` events.
  - **C** Real Remotion preview wired to the sandbox workspace, re-mounting on file changes.
  - **D** Drag-and-drop upload UI in chat panel, hitting `POST /uploads` from T1.
  - **E** Connection-status badges for Mastra and Sandbox.
- **Start now?** Phase 2 shell is already in place. Each sub-part needs different backend pieces:
  - A needs T2 (Planner's delegation tools emit events on the bus) — replaces the mocked agent-log feed.
  - B needs `SANDBOX_WORKSPACE_DIR` to exist (T1 + T6) — replaces the mocked file tree in `bottom-panel.tsx`.
  - C needs T6 actually writing files — replaces `mock-product-tour.tsx` in `player-panel.tsx`.
  - D needs T1's `/uploads` route — adds the dropzone to the existing `chat-panel.tsx`.
  - E needs T7's MCP client (sandbox health) and the SSE stream from A — adds badges to `topbar.tsx`.
- **Parallelism inside phase 4**: A and B can be built in parallel by two people; C depends on B; D and E depend on A.
- **Files**: spec lists `web/src/components/{activity-panel,file-tree-panel,player-panel}.tsx` as "rewrite" — in practice these map to the existing `agent-log.tsx`, `bottom-panel.tsx`, `player-panel.tsx`. Don't create duplicates; modify in place. New files (`code-viewer.tsx`, `upload-dropzone.tsx`, `connection-status.tsx`, `lib/events.ts`, `lib/workspace-api.ts`) still need to be added. Backend side: ~4 new files under `mastra/src/mastra/server/`.
- **Checkpoint**: 9-step end-to-end flow at the bottom of the spec.
- **Docs**: <https://developer.mozilla.org/docs/Web/API/Server-sent_events>, <https://www.remotion.dev/docs/player/api>, <https://tanstack.com/query/latest/docs/framework/react/guides/queries>.

---

## Suggested Team Allocation

Phase 2 is already done, so allocation focuses on backend + integration.

If you have 2–3 people:

- **Person A (frontend lead)**: Phase 4 parts A, D, E (activity stream consumer, upload dropzone in chat panel, connection badges in topbar). Idle until T1 + T2 land — until then, can write the v1 skill markdown content from T7.
- **Person B (backend/agents)**: T1 → T3/T4 → T2 → Phase 4 parts B and C (workspace read-through routes + real preview).
- **Person C (infra)**: T6 → T7 (MCP client wiring) → drafts for T3/T4 instructions.

If solo: T1 → T6 (parallel) → T3/T4 → T2 → T7 → Phase 4.

---

## Workflow Per Task

1. Open the task file in `tasks/`. Read it fully — every task has a "Where To Work", "Files To Create", and "Checkpoint" section.
2. Check `AGENTS.md` for any constraint that touches this task (sandbox boundary, field ownership, retrieval rules).
3. Verify the API of any external library against its **current** docs (links in each task card above) before quoting it. APIs change.
4. Build the **smallest correct slice** that hits the checkpoint. Don't add abstractions for hypothetical future swaps.
5. Run the checkpoint. If it doesn't pass, that's the work.
6. Commit with a message describing the *why*. Don't commit `.env`, `node_modules/`, or anything in `sandbox/.workspace/`.

---

## Local Setup (One-Time)

```powershell
# from repo root
bun install
copy sandbox\.env.example sandbox\.env
# create mastra/.env and root .env per docs/SETUP_GUIDE.md
```

Run all three services:

```powershell
bun run dev
```

Or one at a time:

```powershell
bun run dev:web      # http://localhost:3000
bun run dev:mastra   # http://localhost:4111
bun run dev:sandbox  # http://localhost:4311
```

---

## Things That Will Bite You

- **Don't import `sandbox/src/*` from `mastra/`** or vice versa. The MCP URL + tool names is the entire contract.
- **Don't write to Workspace State directly** — go through the helpers in `mastra/src/mastra/memory/access.ts` so role ownership is enforced.
- **Don't give Planner or Art Director sandbox tools.** Retrieval only. Implementor is the only sandbox consumer.
- **Don't reformat files you didn't change.** Match the file's existing style.
- **Don't add a dependency** before checking `mastra/package.json`, `web/package.json`, `sandbox/package.json` — there's probably already something installed.
- **Don't touch `docs/reference/`**. It's frozen historical context.

---

## Related Reading (in priority order)

1. `AGENTS.md` — rules and architecture constraints
2. `PROJECT_OVERVIEW.md` — what we're building and why
3. `docs/SETUP_GUIDE.md` — phases, env vars, structure
4. `docs/editing agent.md` — agent responsibilities, routing rules, memory model
5. `docs/local-sandbox-service-design.md` — sandbox contract
6. `docs/project-knowledge-and-skills.md` — knowledge layer + skills system
7. `docs/pdf-upload-walkthrough.md`, `docs/upload-walkthroughs.md` — ingestion traces per file type
