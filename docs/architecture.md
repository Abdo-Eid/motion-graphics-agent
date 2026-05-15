# Architecture (Engineer's View)

This is the engineer-facing architecture doc: ports, file paths, code-level boundaries, MVP conventions. For product framing, see [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md).

## Active Architecture

```text
Planner (supervisor) ──▶ Art Director (subagent)
                    └──▶ Implementor (subagent)
```

The Planner is a Mastra **supervisor agent**. It lists Art Director and Implementor under `agents: { ... }`; Mastra auto-generates the subagent tools (`agent-artDirector`, `agent-implementor`) from that map. There is no separate orchestration module. Routing rules live in the Planner's system prompt; bus emission lives in `delegation` hooks.

Field ownership is enforced by the role-guarded helpers in `mastra/src/mastra/memory/access.ts`. Wrong-role writes throw and emit `field-ownership-violation` on the bus regardless of which agent calls them.

Canonical spec: [`../tasks/T2-planner-agent.md`](../tasks/T2-planner-agent.md). Subagent specs: [`../tasks/T3-art-director-agent.md`](../tasks/T3-art-director-agent.md), [`../tasks/T4-implementor-agent.md`](../tasks/T4-implementor-agent.md).

## Routing

The full routing table lives in [`../tasks/T2-planner-agent.md`](../tasks/T2-planner-agent.md). Summary:

- Exact tweak -> `agent-implementor` only
- Creative change -> `agent-artDirector` then `agent-implementor`
- Style change -> `agent-artDirector` then affected scenes through `agent-implementor`
- Error fix -> `agent-implementor` only
- Initial generation / restructure -> write the plan in chat, wait for user confirmation, call Art Director for full-video or affected-scene design, then call Implementor scene-by-scene

## Runtime Layout

```text
Vite + React frontend      (:3000)   chat, preview, activity, file viewer
Mastra agent server        (:4111)   agents, memory, knowledge, uploads, Workspace tools, SSE
```

The frontend streams from Mastra. Mastra owns all model calls and all file/command execution.

## Workspace Tools Boundary

Generated project files live under a local workspace directory resolved by the Mastra server. `WORKSPACE_PATH` can override the location; otherwise the default should be a gitignored `.workspace` directory under the Mastra workspace.

Mastra Workspace is the execution layer:

- `Workspace` combines filesystem and command execution capabilities.
- `LocalFilesystem` provides bounded file access.
- `LocalSandbox` runs commands with the workspace as the working directory.
- `createWorkspaceTools(...)` exposes tools to agents.

Only the Implementor receives file and command tools. Planner and Art Director never get filesystem or command execution tools.

Tool names stay generic (`read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `exec_command`) even though they are backed by Mastra Workspace. Do not introduce provider-specific names like `local_read`.

## Project State

Three project-scoped layers, no cross-session or user-level memory:

1. **Conversation Context** — chat thread + Mastra Observational Memory.
2. **Workspace State** — Mastra working memory with `brief`, `styleContext`, `sceneRegistry[n].design`, `assets[]`.
3. **Project Knowledge Store** — `LibSQLVector` index for large unstructured docs, partitioned by `projectId`.

Canonical schema: [`../tasks/T1A-memory-and-state.md`](../tasks/T1A-memory-and-state.md). Layer principles, retrieval rules, agent read/write matrix: [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md). Per-input-type ingest traces: [`upload-walkthroughs.md`](upload-walkthroughs.md).

## Tech Stack

Canonical tech stack table with doc links: [`../AGENTS.md`](../AGENTS.md#tech-stack-quick-reference).

Summary: Bun workspaces (`web`, `mastra`), Vite + React + Tailwind v4 + TanStack Router/Query frontend, Mastra agent framework with the AI SDK model router, LibSQL for memory + vector, Mastra Workspace for file/command tools, Remotion + `@remotion/player` for video, zod 4 for validation.

## MVP Constraints

- 20-30 second product and screen-recording videos
- 30 fps
- No complex 3D
- No custom audio pipeline
- Output must remain editable Remotion source

## Implementation Conventions

- Each scene is a separate component in `src/scenes/`.
- `AbsoluteFill` is the root container.
- Prefer `spring()` for animation unless another approach is clearly needed.
- Tailwind classes are preferred where appropriate.
- No external API calls from Remotion compositions.
- No filesystem access from browser-executed compositions.

## Related Docs

- [`../PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — product framing, vision, user stories
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — work board, task cards, dependency graph
- [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md) — state-layer principles, retrieval rules, skills
- [`upload-walkthroughs.md`](upload-walkthroughs.md) — per-input-type ingest traces
