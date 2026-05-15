# Phase 3 — Planner Agent (Supervisor) + Subagent Delegation

> **Status:** Updated after architecture simplification. Keep this spec as the contract for future edits and regressions.

## Your Role

Build the **Planner agent** as a Mastra **supervisor agent**: it owns the user conversation, classifies intent, produces the brief, and dispatches the Art Director and Implementor as subagents wired through Mastra's built-in `agents: { ... }` property. Routing rules live in the Planner's system prompt — no separate orchestrator, no hand-rolled delegation tools.

## Why Mastra's Supervisor Pattern

A creative video tool is a chat. The same agent that hears the user should also decide what to do next. Mastra's supervisor pattern ([docs](https://mastra.ai/docs/agents/supervisor-agents)) expresses that directly: list other agents under `agents: { ... }`, Mastra exposes each as a tool named `agent-<key>`, the supervisor LLM calls those tools to delegate, and `delegation` hooks intercept each call to emit bus events, rewrite prompts, or stop the loop. This is the framework-recommended path — it replaces the deprecated `.network()` API ([migration guide](https://mastra.ai/guides/migrations/network-to-supervisor)).

Trade-off: less determinism (the LLM could hallucinate a delegation), mitigated by prompt discipline and field ownership. The role-guarded helpers in `memory/access.ts` reject wrong-role writes regardless of caller. Delegation hooks are for observability, not workflow enforcement.

## What You Build

```
mastra/src/mastra/
  agents/
    planner.ts            ← supervisor agent (lists artDirector + implementor under `agents`)
  server/
    bus.ts                ← in-process event emitter (consumed by Phase 4 SSE route)
  index.ts                ← register all three agents
```

No `delegations.ts` file. Delegation is wiring, not code.

## Responsibilities (Planner)

- Receive user intent
- Ask clarifying questions only when obvious missing essentials would block a useful result
- Produce a structured brief (call `setBrief`)
- Use RAG to retrieve relevant project knowledge from uploaded docs and assets
- **Write the full scene-by-scene plan as a chat message** before any delegation and wait for user confirmation (see "Plan In Chat" below)
- **Classify follow-up edits and delegate directly** by calling the auto-generated `agent-artDirector` and `agent-implementor` tools
- Drive the AD -> Implementor handoff at a high level.
- Let specialists ask the user direct, natural questions when they are the right person to ask.

The Planner does not write code and does not use filesystem or command tools. Routing decisions and the scene plan are implicit in chat — not persisted as a separate field.

## Plan In Chat

For a fresh project, after the brief is set, the Planner writes the **whole-video plan as a normal chat message** before delegating anything. It then waits for the user to approve or adjust the plan before calling the Art Director. Format is informal but predictable:

```
Plan (≈20s total):
1. Intro — logo reveal (0–3s)
2. Problem — quick framing of the pain (3–8s)
3. Solution — product demo highlight (8–16s)
4. CTA — sign-up nudge (16–20s)
```

The plan lives in conversation history. Observational Memory will compress old turns over time; the brief in working memory keeps the high-fidelity record. There is no `scenePlan` field in working memory — the plan is a chat artifact, not state.

Clarification before the plan should be minimal: ask only for obvious missing essentials, not every possible preference. If the goal, approximate duration, and enough product/content context are present, make reasonable assumptions and show them in the plan for confirmation.

For follow-up edits on an existing project, no new plan is written unless the user is asking for a major restructure; the Planner classifies the edit per the routing table and delegates.

## Delegation Flow

For initial generation, the Art Director should usually design the whole video in one delegation. This keeps style, pacing, transitions, and scene-to-scene continuity coherent.

```
Planner -> Art Director once:
  writes styleContext
  writes sceneRegistry[1].design
  writes sceneRegistry[2].design
  sceneRegistry[3].design
  ...

Planner -> Implementor scene 1
Planner -> Implementor scene 2
Planner -> Implementor scene 3
```

The Planner manages sequencing in its prompt. Delegation hooks do not parse prompts, track scene numbers, or reject scene-ordering policy. Lower layers still enforce real safety: role-guarded Workspace State writes and Implementor-only Workspace tools.

## Routing Rules (Live in the Planner's Prompt)

| User request | Planner action |
|---|---|
| Initial generation (fresh project) | write the plan in chat, wait for user confirmation, call `agent-artDirector` once for full-video design, then call `agent-implementor` scene-by-scene |
| Exact tweak ("make the title bigger") | call `agent-implementor` for the affected scene only |
| Creative change ("make intro feel energetic") | call `agent-artDirector` for the scene, then `agent-implementor` |
| Major restructure ("add a pricing scene") | rewrite the plan in chat, call Art Director for affected scene designs, then Implementor for affected scenes |
| Style change ("use blue instead of red") | call `agent-artDirector` (style only), then `agent-implementor` per affected scene, sequentially |
| Error fix ("fix the typecheck error in scene 2") | call `agent-implementor` for scene 2 only |

If classification is unclear, ask one focused question before delegating.

## Planner Setup

```ts
// agents/planner.ts
import { Agent } from '@mastra/core/agent'
import { agentModel } from '../model'
import { setBrief } from '../memory/access'
import { retrieveProjectKnowledge } from '../knowledge/retrieve'
import { artDirectorAgent } from './art-director'
import { implementorAgent } from './implementor'
import { bus } from '../server/bus'

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `...`,                         // see "Instructions To Write"
  model: agentModel(),

  // Regular tools the Planner uses directly:
  tools: {
    setBrief,                                  // role-bound to 'planner'
    retrieveProjectKnowledge,                  // RAG
  },

  // Subagents — Mastra auto-creates `agent-artDirector` and `agent-implementor` tools:
  agents: {
    artDirector: artDirectorAgent,
    implementor: implementorAgent,
  },

  // Hook into the delegation lifecycle for bus events:
  defaultOptions: {
    delegation: {
      onDelegationStart: async (ctx) => {
        // ctx.primitiveId is the subagent id (e.g. "art-director-agent")
        bus.emit('agent.start', {
          agent: ctx.primitiveId,
          input: ctx.prompt,
        })
        return { proceed: true }
      },

      onDelegationComplete: async (ctx) => {
        if (ctx.error) {
          bus.emit('agent.error', { agent: ctx.primitiveId, error: String(ctx.error) })
          return
        }
        bus.emit('agent.end', {
          agent: ctx.primitiveId,
          output: ctx.result,
        })
      },
    },
  },
})
```

Notes:

- Memory helpers are exposed as tools with the role pre-bound; the agent cannot pass a different role.
- Auto-generated subagent tool names: `agent-<objectKey>` ([docs](https://mastra.ai/docs/agents/using-tools#agents-as-tools)). `ctx.primitiveId` is the subagent's own `id` (e.g. `'art-director-agent'`), not the tool name.
- The hook does not parse the subagent's reply or the Planner's prompt. Scene-level UI updates come from Workspace State changes and filesystem/read-through routes, not hook-enforced scene policy.

## Instructions To Write

Cover:

1. **Role**: supervisor. Talk to the user, classify intent, produce the brief, and delegate via `agent-artDirector` / `agent-implementor`.
2. **Brief output**: project goal, audience, tone, duration, assets, key messages, user preferences. Call `setBrief` to persist.
3. **Clarification**: ask only for obvious missing essentials that would block a useful result. Avoid over-questioning; infer reasonable defaults and show them in the plan.
4. **Routing**: classify each follow-up using the table above and call the matching subagent tool(s). Routing is implicit in your delegation choices — not persisted separately.
5. **Delegation discipline**:
   - Prefer one `agent-artDirector` call for the full-video design during initial generation.
   - Wait for user confirmation after the visible plan before calling `agent-artDirector` for a new project.
   - Wait for relevant Art Director design before delegating Implementor work for a scene.
   - Run Implementor scene-by-scene unless the user explicitly asks for a different strategy.
   - On Implementor error for scene `n`: pause and decide between re-delegating to Implementor, calling Art Director if the design is the problem, or asking the user.
   - Let specialists ask the user direct, natural questions when they are the best person to ask.
6. **RAG vs Memory split**:
   - Planner is the main RAG consumer
   - Workspace State holds the active working state
   - RAG feeds facts into prompts; memory persists decisions
7. **Constraints**: MVP is short product and screen-recording videos only. The Planner never writes code, never reads/writes files, never invokes Workspace tools.

## Subagent `description` Fields

The supervisor LLM picks which subagent to call based on each subagent's `description` field. These must be specific. Set them on the subagent definitions in `art-director.ts` / `implementor.ts`:

```ts
// art-director.ts
export const artDirectorAgent = new Agent({
  id: 'art-director-agent',
  description: `Designs scenes: layout, palette, typography, pacing, motion direction.
    Reads brief and current styleContext, writes styleContext and sceneRegistry[n].design.
    Use when the request needs new creative direction (feel, layout, style change, new scenes).
    Can ask the user creative questions directly when direction is missing.`,
  // ...
})

// implementor.ts
export const implementorAgent = new Agent({
  id: 'implementor-agent',
  description: `Writes Remotion scene code for one scene at a time.
    Reads finalized scene design + styleContext, runs Workspace tools (read_file, write_file, exec_command).
    Use after the Art Director has produced a design, or for exact unambiguous code edits.
    Can ask the user technical questions directly when implementation is blocked. Does NOT write working memory.`,
  // ...
})
```

## Brief Shape

```ts
{
  goal: string,
  audience: string,
  tone: string,
  duration: number,         // seconds
  assets: string[],         // asset ids referenced from Workspace State
  keyMessages: string[],
  userPreferences?: Record<string, string>,
}
```

## Delegation Hooks

Delegation hooks are observability hooks. They emit lifecycle events and do not enforce scene-ordering policy:

```ts
onDelegationStart: async (ctx) => {
  bus.emitEvent('agent.start', { agent: ctx.primitiveId, input: ctx.prompt })
  return { proceed: true }
}
```

Do not parse Planner prose, subagent replies, or scene numbers in hooks. If a specialist needs user input, it asks naturally instead of returning a mandatory machine-readable summary block.

## Memory Handoff

Subagents read and write Workspace State through their own role-correct helpers from `memory/access.ts`. The supervisor's delegation mechanism does not touch memory directly — Mastra runs `subagent.generate(...)` under the hood; our `delegation` hooks only emit bus events.

| Agent | Reads | Writes |
|---|---|---|
| Planner | user input, RAG facts | `brief` |
| Art Director | `brief`, `styleContext` | `styleContext`, `sceneRegistry[n].design` |
| Implementor | `sceneRegistry[n].design`, `styleContext` | none (reports naturally + filesystem) |

Field ownership is enforced by `memory/access.ts` — wrong-role writes throw, and the helpers themselves emit `field-ownership-violation` on the bus.

## Event Bus

A tiny in-process pub/sub. Phase 4 builds the SSE route on top of this — for now, only the in-process API matters.

```ts
// server/bus.ts (sketch)
import { EventEmitter } from 'node:events'

export type BusEvent =
  | { type: 'agent.start'; agent: string; input?: unknown }
  | { type: 'agent.end';   agent: string; output?: unknown }
  | { type: 'agent.error'; agent: string; error: string }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string }

export const bus = new EventEmitter()
```

Where events come from:

- `onDelegationStart` emits `agent.start`.
- `onDelegationComplete` emits `agent.end` (or `agent.error` on failure). It does not parse the subagent reply.
- Access-layer throws emit `field-ownership-violation`.

Scene-level UI state is reconstructed from Workspace State changes plus filesystem watchers under `<workspace>/src/` — not from parsing specialist replies.

## Registration

```ts
// mastra/src/mastra/index.ts
import { Mastra } from '@mastra/core/mastra'
import { chatRoute } from '@mastra/ai-sdk'
import { plannerAgent } from './agents/planner'
import { artDirectorAgent } from './agents/art-director'
import { implementorAgent } from './agents/implementor'

export const mastra = new Mastra({
  agents: { plannerAgent, artDirectorAgent, implementorAgent },
  server: {
    apiRoutes: [chatRoute({ path: '/chat/:agentId' })],
  },
})
```

The Planner is wired with both subagents via its `agents` property (no separate delegation tools). The Art Director and Implementor are also registered top-level so the `/chat/artDirectorAgent` and `/chat/implementorAgent` endpoints exist for direct testing.

## Checkpoints

Run:

```bash
bun run dev:mastra
```

**1. Full generation flow.**

```powershell
curl -X POST http://localhost:4111/chat/plannerAgent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make a 20-second product demo for a note-taking app\"}]}"
```

Expected:

- Planner asks a clarifying question, **or**
- Planner produces a brief, then emits tool calls to `agent-artDirector` and `agent-implementor` (visible in the response trace as `tool-call` events with `toolName: "agent-artDirector"` / `toolName: "agent-implementor"`).
- Art Director writes `styleContext` and scene designs.
- Implementor writes scene code when Workspace tools are available.
- Bus emits matching `agent.start` / `agent.end` events from the `delegation` hooks.

**2. Tweak routing.**

```powershell
curl -X POST http://localhost:4111/chat/plannerAgent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make the title bigger\"}]}"
```

Expected: Planner emits only `agent-implementor`. Art Director is not invoked.

## Reference

- [`T1A-memory-and-state.md`](T1A-memory-and-state.md) — `setBrief` and the role-guarded helpers the Planner uses
- [`T1B-knowledge-and-uploads.md`](T1B-knowledge-and-uploads.md) — `retrieveProjectKnowledge` tool the Planner consumes
- [`T3-art-director-agent.md`](T3-art-director-agent.md) — subagent invoked via `agent-artDirector`
- [`T4-implementor-agent.md`](T4-implementor-agent.md) — subagent invoked via `agent-implementor`
- [`../docs/architecture.md`](../docs/architecture.md)
- `docs/project-knowledge-and-skills.md`
- Mastra supervisor agents: <https://mastra.ai/docs/agents/supervisor-agents>
- Mastra agents-as-tools: <https://mastra.ai/docs/agents/using-tools#agents-as-tools>
- `.network()` deprecation / migration: <https://mastra.ai/guides/migrations/network-to-supervisor>
