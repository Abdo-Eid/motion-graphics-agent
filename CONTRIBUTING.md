# Contributing Guide

How to pick up work on this repo. Read [`AGENTS.md`](AGENTS.md) first if you or your AI assistant will be writing code.

This document is the work board: every active task, what it depends on, and where to begin.

## TL;DR

- Two Bun workspaces: `web/` (port 3000) and `mastra/` (port 4111).
- Run everything: `bun run dev`. Run one: `bun run dev:web` / `bun run dev:mastra`.
- Specs for active tasks live in `tasks/`. Read the spec before writing code.
- Architecture rules that are not negotiable live in `AGENTS.md`.
- "Workspace" is overloaded: Workspace State, workspace root, Mastra Workspace, and Bun workspaces are different things. See `PROJECT_OVERVIEW.md` before editing workspace-related code.

## Repo Map

| Path | What it is |
|---|---|
| `web/` | Vite + React frontend. Chat, preview, activity, file viewer. |
| `mastra/` | Mastra agent server. Agents, memory, knowledge store, uploads, Workspace tools, SSE event bus, workspace read-through routes. |
| `tasks/` | Task specs. Source of truth for scope. |
| `docs/` | Architecture and design docs. |
| `PROJECT_OVERVIEW.md` | Product vision + system diagram. |
| `AGENTS.md` | Rules for AI coding agents. |

## Current Architecture

Planner is a Mastra supervisor agent. Art Director and Implementor are subagents listed under `agents: { ... }`; Mastra auto-generates `agent-artDirector` / `agent-implementor` tools and runs delegations under the hood. Bus emission lives in `delegation` hooks. There is no separate orchestrator and no hand-rolled `delegations.ts`.

The Implementor uses Mastra Workspace tools directly inside the Mastra server. There is no second execution service in the active design.

## Dependency Graph

```text
                ┌──────────────────────────┐
                │ T1 Memory + Knowledge    │
                │   + Uploads              │
                └─────────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ T3 Art Dir   │      │ T4 Implementor│     │ T2 Planner   │
 │  (subagent)  │      │  (subagent)  │      │ (supervisor +│
 └──────┬───────┘      └──────┬───────┘      │  hooks + bus)│
        │                     │              └──────┬───────┘
        └─────────┬───────────┘                     │
                  ▼                                 │
                  └─────────────────────────────────┘
                       Planner dispatches subagents

                              │
                              ▼
                     ┌────────────────┐
                     │ T5 Workspace   │
                     │ tools + skills │
                     └────────┬───────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Phase 4        │
                     │ frontend live  │
                     └────────────────┘
```

## Task Cards

### T1 — Memory, Knowledge Store, Uploads · complete

Overview lives in `tasks/T1-memory-knowledge-uploads.md`. Track specs:

- `tasks/T1A-memory-and-state.md`
- `tasks/T1B-knowledge-and-uploads.md`

What shipped:

- Workspace State as Mastra working memory.
- Role-guarded setter tools for Planner and Art Director.
- Project Knowledge Store with LibSQLVector.
- Upload route and per-file handlers.

### T2 — Planner Agent · complete

- **Spec**: `tasks/T2-planner-agent.md`
- **What**: Mastra supervisor agent that owns user conversation, clarification, brief, routing, and dispatches subagents via generated tools.
- **Files**: `mastra/src/mastra/agents/planner.ts`, `mastra/src/mastra/server/bus.ts`, `mastra/src/mastra/index.ts`.

### T3 — Art Director Agent · complete

- **Spec**: `tasks/T3-art-director-agent.md`
- **What**: Creative-design agent. Brief -> style context and scene designs. No code and no filesystem tools.
- **Files**: `mastra/src/mastra/agents/art-director.ts`.

### T4 — Implementor Agent · complete baseline

- **Spec**: `tasks/T4-implementor-agent.md`
- **What**: Execution agent. Reads scene design and style context, writes Remotion code, runs checks, and fixes errors.
- **Current state**: skeleton exists. Tool attachment and skill loading are split into T5.
- **Files**: `mastra/src/mastra/agents/implementor.ts`, `mastra/src/mastra/workspace-config.ts`, `mastra/src/mastra/index.ts`.

### T5 — Workspace Tools + Skills · active

- **Spec**: `tasks/T5-workspace-tools-and-skills.md`
- **What**: Promote `mastra/src/mastra/workspace-config.ts` into the canonical execution layer and attach workspace-backed tools to Implementor only.
- **Expected tools**: `read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `exec_command`, and any check helpers we add on top of `exec_command`.
- **Skill docs**: short Remotion implementation guides loaded on demand by Implementor. They should live under `mastra/skills/` or another Mastra-owned path, not a separate service.
- **Checkpoint**: Implementor can list files, write a small file in the workspace, and run `node --version` from Mastra Studio or the chat endpoint.

### Phase 2 — Frontend Shell · complete

- **Spec**: `tasks/phase-2-frontend.md`
- **What**: Full-viewport UI with chat, preview, activity, and bottom panels.
- **Run**: `bun run dev:web`.

### Phase 4 — Frontend Integration · active

- **Spec**: `tasks/phase-4-frontend-integration.md`
- **What**: Replace mock data sources with real backend wiring: SSE activity stream, workspace read-through routes, file watcher, live preview, upload UI, and Mastra connection status.
- **Backend files**: `mastra/src/mastra/server/events.ts`, `workspace-files.ts`, `watcher.ts`, `bus.ts`.
- **Frontend files**: `web/src/lib/events.ts`, `workspace-api.ts`, and related panel components.

## Suggested Solo Order

1. Finish T5 direct Workspace tool attachment for Implementor.
2. Add T5 skill docs and skill-loading tools.
3. Wire Phase 4 activity stream and workspace file routes.
4. Wire preview reload and upload progress.

## Commands

```bash
bun install
bun run dev
bun run dev:web
bun run dev:mastra
```

Run package-local checks from the package directory, for example:

```bash
cd mastra
bunx tsc --noEmit -p tsconfig.json
```
