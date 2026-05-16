# Phase 3 — Implementor Agent

> **Architecture note.** Invoked as a subagent by the Planner via the auto-generated `agent-implementor` tool (Mastra supervisor pattern). See [`T2-planner-agent.md`](T2-planner-agent.md) for supervisor and delegation-hook wiring.
>
> **Status:** Workspace tools attached directly to the Implementor via `workspace-config.ts`. Skill files are deferred (see [`T5-workspace-tools-and-skills.md`](T5-workspace-tools-and-skills.md)).

## Your Role

Build the **Implementor agent**. This is the execution agent.

It receives Art Director scene designs plus shared style context, then writes actual Remotion code. It owns layout, styling, animations, transitions, and the verification loop.

The Implementor is invoked through the auto-generated `agent-implementor` subagent tool on the Planner. The `/chat/implementor-agent` endpoint exists for direct testing only.

## What the Implementor Does

- reads scene design output from Art Director
- uses working memory (`styleContext`, `sceneRegistry`) as primary input
- does not write to working memory
- loads relevant skill docs before editing
- writes Remotion compositions and scene files
- implements styling, motion, and transitions
- runs typecheck after edits
- optionally runs render checks
- reports changed files, verification results, and blockers naturally in chat

This agent writes real React and Remotion code.

## Where To Work

- `mastra/src/mastra/agents/implementor.ts`
- `mastra/src/mastra/index.ts`

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'
import { codingModel } from '../model'

export const implementorAgent = new Agent({
  id: 'implementor-agent',
  name: 'Implementor',
  instructions: `...`,
  model: codingModel(),
  memory: readOnlyMemory,
  tools: workspaceTools,
})
```

## Instructions To Write

Instructions should define:

1. **Role**: execution-only agent implementing Art Director output faithfully.
2. **Inputs**: Art Director scene design, shared `styleContext`, existing files, and available skills.
3. **Workflow**: load skills, inspect files, edit surgically, create new files only when necessary, typecheck after edits, fix errors until clean.
4. **Conventions**: `AbsoluteFill`, `useCurrentFrame()`, `useVideoConfig()`, `spring()`, Tailwind where appropriate, scenes under `src/scenes/`.
5. **Constraints**: 30 fps, short product-video scope, no external API calls in compositions, no filesystem access in browser-executed compositions.
6. **Reply style**: respond naturally. Mention changed files, verification results, and blockers. Ask one focused technical question when needed.

Implementation rules:

- Follow Art Director design faithfully.
- Do not reinterpret layout or animation style on your own.
- Use implementation judgment only to fill small gaps.
- Keep edits surgical and avoid rewriting full files when targeted edits work.

## Tools

The Implementor uses Mastra Workspace tools directly inside the Mastra server. The concrete tool wiring is in [`T5-workspace-tools-and-skills.md`](T5-workspace-tools-and-skills.md).

Only the Implementor gets file and command tools. Planner and Art Director do not.

Mastra prefixes Workspace tool names with `mastra_workspace_` at runtime, but the agent instructions use the generic conceptual names:

- `list_files`
- `read_file`
- `write_file`
- `edit_file`
- `grep`
- `exec_command`
- `get_process_output` / `kill_process` (if background commands are enabled)
- `skill`
- `skill_search`
- `skill_read`

The Implementor uses `readOnlyMemory` and is not given role-guarded memory-write tools from `memory/access.ts`.

## Checkpoint

Run:

```bash
bun run dev
```

Test in Mastra Studio or via chat endpoint:

```text
List files in the workspace, write hello.txt with the content hi, then run node --version.
```

Expected: Implementor invokes `list_files`, creates the file under the workspace root via `write_file`, and reports the command result from `exec_command`.

## Reference

- [`T2-planner-agent.md`](T2-planner-agent.md) — supervisor wiring and delegation hooks
- [`../docs/architecture.md`](../docs/architecture.md) — active architecture
- [`T5-workspace-tools-and-skills.md`](T5-workspace-tools-and-skills.md) — Workspace tool and skill wiring
- [`../docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — state and skills rules
