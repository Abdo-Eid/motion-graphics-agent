# Architecture (Engineer's View)

This is the engineer-facing architecture doc: ports, file paths, code-level boundaries, MVP conventions. For the product framing (vision, users, user stories, why-this-design) see [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md).

## Active Architecture

```text
Planner (supervisor) ──▶ Art Director (subagent)
                    └──▶ Implementor (subagent)
```

The Planner is a Mastra **supervisor agent**. It lists Art Director and Implementor under `agents: { ... }`; Mastra auto-generates the subagent tools (`agent-artDirector`, `agent-implementor`) from that map. There is no separate orchestration module — routing rules live in the Planner's system prompt; bus emission and invariant guards live in `delegation` hooks.

Field ownership is enforced by the role-guarded helpers in `mastra/src/mastra/memory/access.ts` — wrong-role writes throw and emit `field-ownership-violation` on the bus regardless of which agent calls them.

Canonical spec: [`../tasks/T2-planner-agent.md`](../tasks/T2-planner-agent.md). Subagent specs: [`../tasks/T3-art-director-agent.md`](../tasks/T3-art-director-agent.md), [`../tasks/T4-implementor-agent.md`](../tasks/T4-implementor-agent.md).

## Routing (Quick Reference)

The full routing table with invariants and the lockstep pipeline lives in [`../tasks/T2-planner-agent.md`](../tasks/T2-planner-agent.md). One-line summary:

- Exact tweak → `agent-implementor` only
- Creative change → `agent-artDirector` then `agent-implementor`
- Style change → `agent-artDirector` (style only) then per-scene `agent-implementor`
- Error fix → `agent-implementor` only
- Initial generation / restructure → write the plan in chat, then run the AD↔Impl pipeline

## Runtime Layout

```text
Vite + React frontend         (:3000)   — chat, preview, activity, file viewer
Mastra agent server           (:4111)   — agents, memory, knowledge, uploads, MCP client, SSE
Local Bun sandbox service     (:4311)   — MCPServer over HTTP; file + exec + skills tools
```

The frontend streams from Mastra with `useChat()`. Mastra owns all model calls. Code execution happens inside the local Bun sandbox process through MCP tools — no Docker, no E2B. See [`local-sandbox-service-design.md`](local-sandbox-service-design.md).

## Sandbox Boundary

The sandbox is a separate local Bun process. The main app (Mastra) connects to its `MCPServer` over HTTP and exposes the discovered tools to the **Implementor only**. The frontend reads workspace files through Mastra read-through routes — never directly from the sandbox.

Architecture rules:

- Tool names are **generic** (`read_file`, `exec_command`). No provider-specific names like `docker_exec` or `local_read`.
- Don't import `sandbox/src/*` from `mastra/` or vice versa. The MCP tool surface is the entire contract.
- The main app writes only to `<sandboxRoot>/{assets,uploads}`. The sandbox owns `src/` and `out/`. The sandbox root is anchored at `<repo>/sandbox/.workspace` by default; both services resolve it the same way (file-anchored in `mastra/src/mastra/sandbox-root.ts` and `sandbox/src/index.ts`, with `WORKSPACE_PATH` as an optional override).

Canonical tool surface and path-guard rules: [`local-sandbox-service-design.md`](local-sandbox-service-design.md#mcp-tool-surface).

## Project State

Three project-scoped layers, no cross-session or user-level memory:

1. **Conversation Context** — chat thread + Mastra Observational Memory (auto-compresses old turns).
2. **Workspace State** — Mastra working memory (schema mode, thread-scoped, readOnly per agent). Fields: `brief`, `styleContext`, `sceneRegistry[n].design`, `assets[]`.
3. **Project Knowledge Store** — `LibSQLVector` index for large unstructured docs, partitioned by `projectId`.

Canonical schema: [`../tasks/T1A-memory-and-state.md`](../tasks/T1A-memory-and-state.md). Layer principles, retrieval rules, agent read/write matrix: [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md). Per-input-type ingest traces: [`upload-walkthroughs.md`](upload-walkthroughs.md).

## Tech Stack

Canonical tech stack table (with doc links per layer): [`../AGENTS.md`](../AGENTS.md#tech-stack-quick-reference).

Summary: Bun workspaces (`web`, `mastra`, `sandbox`), Vite + React + Tailwind v4 + TanStack Router/Query frontend, Mastra agent framework with the AI SDK model router, LibSQL for memory + vector, Mastra MCP for the sandbox transport, Remotion + `@remotion/player` for video, zod 4 for validation.

## Build Phases

For the canonical phase-by-phase walkthrough with checkpoints, see [`SETUP_GUIDE.md`](SETUP_GUIDE.md). Status snapshot lives in [`../CONTRIBUTING.md`](../CONTRIBUTING.md#phase-overview).

## MVP Constraints

- 20–30 second product and screen-recording videos
- 30 fps
- No complex 3D
- No custom audio pipeline
- Output must remain editable Remotion source

## Implementation Conventions (Remotion)

- Each scene is a separate component in `src/scenes/`
- `AbsoluteFill` as the root container
- Prefer `spring()` for animation unless another approach is clearly needed
- Tailwind classes for styling
- No external API calls from Remotion compositions
- No filesystem access from browser-executed compositions

## Related Docs

- [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — product framing, vision, user stories
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — work board, task cards, dependency graph
- [`SETUP_GUIDE.md`](SETUP_GUIDE.md) — phases, env vars, checkpoints
- [`local-sandbox-service-design.md`](local-sandbox-service-design.md) — sandbox MCP contract
- [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md) — state-layer principles, retrieval rules, skills
- [`upload-walkthroughs.md`](upload-walkthroughs.md) — per-input-type ingest traces
