# Phase 3 — Planner Agent (Supervisor) + Subagent Delegation

> **Status:** Complete on `main` as the current baseline. Keep this spec as the contract for future edits and regressions.

## Your Role

Build the **Planner agent** as a Mastra **supervisor agent**: it owns the user conversation, classifies intent, produces the brief, and dispatches the Art Director and Implementor as subagents wired through Mastra's built-in `agents: { ... }` property. Routing rules live in the Planner's system prompt — no separate orchestrator, no hand-rolled delegation tools.

## Why Mastra's Supervisor Pattern

A creative video tool is a chat. The same agent that hears the user should also decide what to do next. Mastra's supervisor pattern ([docs](https://mastra.ai/docs/agents/supervisor-agents)) expresses that directly: list other agents under `agents: { ... }`, Mastra exposes each as a tool named `agent-<key>`, the supervisor LLM calls those tools to delegate, and `delegation` hooks intercept each call to emit bus events, rewrite prompts, or stop the loop. This is the framework-recommended path — it replaces the deprecated `.network()` API ([migration guide](https://mastra.ai/guides/migrations/network-to-supervisor)).

Trade-off: less determinism (the LLM could hallucinate a delegation), mitigated by prompt discipline and `onDelegationStart` rejections. Field ownership is unchanged — the role-guarded helpers in `memory/access.ts` reject wrong-role writes regardless of caller.

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
- Ask clarifying questions when constraints are missing
- Produce a structured brief (call `setBrief`)
- Use RAG to retrieve relevant project knowledge from uploaded docs and assets
- **Write the full scene-by-scene plan as a chat message** before any delegation (see "Plan In Chat" below)
- **Classify follow-up edits and delegate directly** by calling the auto-generated `agent-artDirector` and `agent-implementor` tools
- Drive the AD↔Implementor pipeline scene-by-scene (see "Pipelined Delegation")
- Read each subagent's returned summary and decide the next step (advance, retry, ask user, finish)

The Planner does not write code and does not use sandbox tools. Routing decisions and the scene plan are implicit in chat — not persisted as a separate field.

## Plan In Chat

For a fresh project, after the brief is set, the Planner writes the **whole-video plan as a normal chat message** before delegating anything. Format is informal but predictable:

```
Plan (≈20s total):
1. Intro — logo reveal (0–3s)
2. Problem — quick framing of the pain (3–8s)
3. Solution — product demo highlight (8–16s)
4. CTA — sign-up nudge (16–20s)
```

The plan lives in conversation history. Observational Memory will compress old turns over time; the brief in working memory keeps the high-fidelity record. There is no `scenePlan` field in working memory — the plan is a chat artifact, not state.

For follow-up edits on an existing project, no new plan is written; the Planner classifies the edit per the routing table and delegates.

## Pipelined Delegation

For initial generation, scenes flow through a 2-stage pipeline: AD designs, Implementor builds. They run in lockstep, one step apart.

```
t1:  AD scene 1
t2:  AD scene 2   ║   Impl scene 1
t3:  AD scene 3   ║   Impl scene 2
…
tN:                ║   Impl scene N
```

**Invariants** (enforced by prompt + `onDelegationStart` guards):

- At most one `agent-artDirector` call in flight at a time.
- At most one `agent-implementor` call in flight at a time.
- AD is at most one scene ahead of the Implementor — never two.
- AD and Implementor never run on the same scene `n` simultaneously (Implementor needs the finalized `sceneRegistry[n].design`).
- On Implementor error for scene `n`: pause the pipeline. Re-delegate scene `n` (Implementor for a small fix, or AD if the design is the problem). Do not advance AD to `n+2` until `n` is settled.

The only legal parallel dispatch is `agent-implementor(n)` ∥ `agent-artDirector(n+1)` in the same Planner turn. Mastra runs parallel tool calls concurrently.

## Routing Rules (Live in the Planner's Prompt)

| User request | Planner action |
|---|---|
| Initial generation (fresh project) | write the plan in chat, then run the pipeline above (AD scene 1 → AD scene 2 ∥ Impl scene 1 → …) |
| Exact tweak ("make the title bigger") | call `agent-implementor` for the affected scene only |
| Creative change ("make intro feel energetic") | call `agent-artDirector` for the scene, then `agent-implementor` |
| Major restructure ("add a pricing scene") | rewrite the plan in chat, then run the pipeline for the affected scenes |
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

  // Hook into the delegation lifecycle for bus events, prompt shaping, and guards:
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
- The hook does not parse the subagent's reply. Scene-level UI updates come from the filesystem (Phase 4 workspace read-through routes watching `<workspace>/src/`) and from the `sceneNumber` already attached to `agent.start` / `agent.end` payloads when the Planner dispatches per-scene work.

## Instructions To Write

Cover:

1. **Role**: supervisor. Talk to the user, classify intent, produce the brief, and delegate via `agent-artDirector` / `agent-implementor`.
2. **Brief output**: project goal, audience, tone, duration, assets, key messages, user preferences. Call `setBrief` to persist.
3. **Clarification**: do not produce a brief or delegate until missing essentials are known. Ask one focused question at a time.
4. **Routing**: classify each follow-up using the table above and call the matching subagent tool(s). Routing is implicit in your delegation choices — not persisted separately.
5. **Delegation discipline**:
   - Always wait for `agent-artDirector` to finish for scene `n` before delegating Implementor work for scene `n`.
   - Run the pipeline: at most one AD call and one Implementor call in flight, with the AD at most one scene ahead of the Implementor.
   - Never run two Implementor calls in parallel.
   - On Implementor error for scene `n`: pause the pipeline (do not start AD on `n+2`); decide between re-delegating to Implementor (small fix), calling Art Director (design issue), or surfacing to the user.
   - Read each subagent's returned summary (see "Subagent Summaries") on the next turn and use it to choose the next action.
6. **RAG vs Memory split**:
   - Planner is the main RAG consumer
   - Workspace State holds the active working state
   - RAG feeds facts into prompts; memory persists decisions
7. **Constraints**: MVP is short product and screen-recording videos only. The Planner never writes code, never reads/writes files, never invokes sandbox tools.

## Subagent `description` Fields

The supervisor LLM picks which subagent to call based on each subagent's `description` field. These must be specific. Set them on the subagent definitions in `art-director.ts` / `implementor.ts`:

```ts
// art-director.ts
export const artDirectorAgent = new Agent({
  id: 'art-director-agent',
  description: `Designs scenes: layout, palette, typography, pacing, motion direction.
    Reads brief and current styleContext, writes styleContext and sceneRegistry[n].design.
    Use when the request needs new creative direction (feel, layout, style change, new scenes).
    Returns a Markdown reply ending in a "## Summary" block.`,
  // ...
})

// implementor.ts
export const implementorAgent = new Agent({
  id: 'implementor-agent',
  description: `Writes Remotion scene code for one scene at a time.
    Reads finalized scene design + styleContext, runs sandbox tools (read_file, write_file, exec_command).
    Use after the Art Director has produced a design, or for exact unambiguous code edits.
    Returns a Markdown reply ending in a "## Summary" block. Does NOT write working memory.`,
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

## Enforcing Invariants In `onDelegationStart`

Prompt discipline catches most violations; the hook is the safety net. If the supervisor LLM emits an illegal delegation (e.g. two `agent-implementor` calls in the same turn, or AD two scenes ahead), reject it:

```ts
onDelegationStart: async (ctx) => {
  if (ctx.primitiveId === 'implementor-agent' && implementorInFlight) {
    return { proceed: false, rejectionReason: 'Implementor already running for another scene.' }
  }
  return { proceed: true }
}
```

In-flight state is tracked in a small map scoped to the supervisor run. Verify the exact context field for run/thread id against `@mastra/core@1.25` types when implementing.

## Subagent Summaries

Both subagents must end every reply with a short summary block. It exists for one reader: the **Planner**, on its next iteration. The supervisor LLM uses it to decide the next pipeline step. The bus and the UI do not parse it — agent identity comes from `agent.start` / `agent.end` payloads, and scene-level state comes from the filesystem.

Required shape (markdown, plain text — no JSON parsing):

```
## Summary
- status: ok | error | needs-input
- notes: <one line — what changed, what's still open, any error, recon facts, etc.>
```

`notes` is free-form. For recon-only dispatches (e.g. "what's in this CSV?") it carries the requested facts. For build dispatches it summarizes what was produced or what failed. Specifics like file paths or working-memory fields touched can go in `notes` if useful, but they aren't required — the filesystem and working memory are the sources of truth.

The Planner's prompt should require it to read the most recent summary block from each subagent before deciding the next delegation. If a summary reports `status: error`, the pipeline pauses per the discipline rules above.

## Memory Handoff

Subagents read and write Workspace State through their own role-correct helpers from `memory/access.ts`. The supervisor's delegation mechanism does not touch memory directly — Mastra runs `subagent.generate(...)` under the hood; our `delegation` hooks only emit bus events.

| Agent | Reads | Writes |
|---|---|---|
| Planner | user input, RAG facts | `brief` |
| Art Director | `brief`, `styleContext` | `styleContext`, `sceneRegistry[n].design` |
| Implementor | `sceneRegistry[n].design`, `styleContext` | none (reports via `## Summary` + filesystem) |

Field ownership is enforced by `memory/access.ts` — wrong-role writes throw, and the helpers themselves emit `field-ownership-violation` on the bus.

## Event Bus

A tiny in-process pub/sub. Phase 4 builds the SSE route on top of this — for now, only the in-process API matters.

```ts
// server/bus.ts (sketch)
import { EventEmitter } from 'node:events'

export type BusEvent =
  | { type: 'agent.start'; agent: string; sceneNumber?: number; input?: unknown }
  | { type: 'agent.end';   agent: string; sceneNumber?: number; output?: unknown }
  | { type: 'agent.error'; agent: string; error: string }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string }

export const bus = new EventEmitter()
```

Where events come from:

- `onDelegationStart` emits `agent.start` (with `sceneNumber` when the Planner dispatched per-scene work).
- `onDelegationComplete` emits `agent.end` (or `agent.error` on failure). It does not parse the subagent reply.
- Access-layer throws emit `field-ownership-violation`.

Scene-level UI state (which scene is building, which one just got new code) is reconstructed from `agent.start` / `agent.end` payloads plus filesystem watchers under `<workspace>/src/` — not from parsing the Summary block.

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

**1. Full pipeline.**

```powershell
curl -X POST http://localhost:4111/chat/plannerAgent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make a 20-second product demo for a note-taking app\"}]}"
```

Expected:

- Planner asks a clarifying question, **or**
- Planner produces a brief, then emits tool calls to `agent-artDirector` and `agent-implementor` (visible in the response trace as `tool-call` events with `toolName: "agent-artDirector"` / `toolName: "agent-implementor"`).
- Art Director writes `styleContext` and scene designs.
- Implementor writes scene code and updates statuses.
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
- `docs/SETUP_GUIDE.md`
- `docs/project-knowledge-and-skills.md`
- Mastra supervisor agents: <https://mastra.ai/docs/agents/supervisor-agents>
- Mastra agents-as-tools: <https://mastra.ai/docs/agents/using-tools#agents-as-tools>
- `.network()` deprecation / migration: <https://mastra.ai/guides/migrations/network-to-supervisor>
