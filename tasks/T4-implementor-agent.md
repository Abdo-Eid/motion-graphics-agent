# Phase 3 — Implementor Agent

> **Architecture note.** Invoked as a subagent by the Planner via the auto-generated `agent-implementor` tool (Mastra supervisor pattern). See [`T2-planner-agent.md`](T2-planner-agent.md) for the supervisor + `delegation`-hook wiring.
>
> **Status:** Complete on `main` for the pre-MCP skeleton. The current baseline includes detailed instructions, read-only working-memory access, registration in `index.ts`, and descriptive fallback behavior until T7 attaches sandbox tools.

## Your Role

Build the **Implementor agent**. This is the execution agent.

It receives Art Director scene designs plus shared style context (read from Workspace State), then writes the actual Remotion code. It owns layout, styling, animations, transitions, and the verification loop.

The Implementor is invoked through the auto-generated `agent-implementor` subagent tool on the Planner — it is not a top-level conversational agent. The `/chat/implementorAgent` endpoint exists for direct testing only.

## What the Implementor Does

- reads scene design output from the Art Director
- uses working memory (`styleContext`, `sceneRegistry`) as primary input
- does **not** write to working memory — pure consumer
- loads relevant skill docs before editing
- writes Remotion compositions and scene files (filesystem)
- implements styling, motion, and transitions in one pass
- runs `run_typecheck()` after edits
- optionally runs `run_render_check()`
- reports changed files, verification results, and any blockers naturally in its reply (not via working memory)

This agent writes real React and Remotion code.

## Where To Work

- `mastra/src/mastra/agents/implementor.ts`
- register it in `mastra/src/mastra/index.ts`

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'
import { agentModel } from '../model'

export const implementorAgent = new Agent({
  id: 'implementor-agent',
  name: 'Implementor',
  instructions: `...`,
  model: agentModel(),
  tools: {},
})
```

## Instructions To Write

Your instructions should define:

1. **Role**: execution-only agent implementing Art Director output faithfully
2. **Inputs**: Art Director scene design, shared `styleContext`, existing files, and available skills
3. **Workflow**:
   - load skills first
   - inspect current files
   - edit surgically with `edit_file`
   - create new files only when necessary
   - typecheck after edits
   - fix errors until clean
4. **Conventions**:
   - `AbsoluteFill` as root container
   - `useCurrentFrame()` and `useVideoConfig()` for timing
   - `spring()` by default for natural animation
   - Tailwind classes where appropriate
   - scenes in `src/scenes/`
5. **Constraints**:
    - 30fps
    - short product-video scope
    - no external API calls in compositions
    - no filesystem access in browser-executed compositions
6. **Reply style**: respond naturally. Mention changed files, verification results, and blockers. If a technical decision is needed, ask the user one focused question. Do not use mandatory machine-readable footer blocks.

Implementation rules:

- follow the Art Director's design faithfully
- do not reinterpret layout or animation style on your own
- use implementation judgment only to fill small gaps
- keep edits surgical and avoid rewriting full files when patch-style edits are possible

## Tools

The Implementor connects to the **Sandbox Service** — a separate local Bun process that exposes its tools over MCP (HTTP, default `http://localhost:4311/mcp`). The main app uses Mastra's `MCPClient` to attach those tools to this agent only. There is no Docker, no container — the sandbox runs directly on the host. See [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md) and [`T6-sandbox-service.md`](T6-sandbox-service.md).

The MCP tool surface the agent should use:

- `read_file`
- `edit_file`
- `create_file`
- `list_files`
- `grep`
- `list_skills`
- `load_skill`
- `run_typecheck`
- `run_render_check`
- `exec_command`
- `exec_background`
- `check_background`
- `kill_background`

Tool hierarchy:

| Tool | Purpose | Built on |
|---|---|---|
| `run_typecheck` | Run typecheck on workspace | `exec_command` |
| `run_render_check` | Run quick render validation | `exec_command` |
| `exec_command` | Run shell command (blocking) | — |
| `exec_background` | Run shell command (non-blocking) | — |
| `check_background` | Poll background process by ID | — |
| `kill_background` | Kill a background process by ID | — |

This is the only role that should use sandbox tools.

The Implementor agent is configured with `workingMemory.readOnly: true` and is **not** given any of the role-guarded memory-write tools from `memory/access.ts`. Its tool surface is exclusively the sandbox MCP tools above.

Before T7 lands, a valid completion for this task is the Implementor skeleton only: registered in `index.ts`, configured for read-only working memory, carrying the full instruction contract, and returning an honest `status: needs-input` summary when sandbox tools are not yet attached.

## Checkpoint

Run:

```bash
bun run dev:mastra
```

Test:

```powershell
curl -X POST http://localhost:4111/chat/implementor-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Implement a three-scene product demo based on the approved scene design\"}]}"
```

Until tools are wired in, a descriptive response is acceptable.

## Reference

- [`docs/local-sandbox-service-design.md`](../docs/local-sandbox-service-design.md) — sandbox service architecture, MCP tool surface, local provider
- [`T6-sandbox-service.md`](T6-sandbox-service.md) — concrete steps to build the sandbox service
- [`T2-planner-agent.md`](T2-planner-agent.md) — supervisor wiring + `delegation` hooks (how the Planner invokes this agent)
- `docs/SETUP_GUIDE.md`
