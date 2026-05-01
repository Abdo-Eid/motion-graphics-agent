# Phase 3 — Planner Agent (Supervisor) + Delegation Tools

## Your Role

Build the **Planner agent** and the small wiring that lets it dispatch the Art Director and Implementor as subagents. The Planner is the supervisor: it owns the user conversation, classifies intent, produces the brief, **and** invokes the other agents directly via subagent tool calls.

There is no separate orchestration module. Routing rules live in the Planner's system prompt.

## Why supervisor pattern (in one paragraph)

A creative video tool is a chat. The same agent that hears the user should also decide what to do next. Splitting that across an LLM (decides) and code (executes) added a hop without making the system more correct, and it blocked parallel scene work. Putting the routing rules in the Planner's prompt and letting it call delegation tools gives parallel dispatch, natural error loops, and removes a whole module of code. The trade-off is less determinism (the LLM could hallucinate a delegation), mitigated by prompt discipline and tool-call validation. Field ownership is still enforced — the role-guarded helpers in `memory/access.ts` reject any wrong-role write regardless of who calls them, so the safety story doesn't change.

## What You Build

```
mastra/src/mastra/
  agents/
    planner.ts            ← supervisor agent
    delegations.ts        ← delegateToArtDirector, delegateToImplementor
  server/
    bus.ts                ← in-process event emitter (consumed by Phase 4 SSE route)
  index.ts                ← register all three agents
```

## Responsibilities (Planner)

- Receive user intent
- Ask clarifying questions when constraints are missing
- Produce a structured brief (call `setBrief`)
- Manage Workspace State (`setBrief`, `setRouting`)
- Use RAG to retrieve relevant project knowledge from uploaded docs, data, and assets
- **Classify follow-up edits and delegate directly** via `delegateToArtDirector` and `delegateToImplementor`
- Watch subagent results and decide the next step (loop, retry, ask user, finish)

The Planner does not write code and does not use sandbox tools. But it does control the flow.

## Routing Rules (Live in the Planner's Prompt)

| User request | Planner action |
|---|---|
| Exact tweak ("make the title bigger") | call `delegateToImplementor(sceneNumber)` only |
| Creative change ("make intro feel energetic") | call `delegateToArtDirector(sceneNumber)`, then `delegateToImplementor(sceneNumber)` |
| Major restructure ("add a pricing scene") | call `delegateToArtDirector` (full), then `delegateToImplementor` per scene |
| Style change ("use blue instead of red") | call `delegateToArtDirector` (style only), then `delegateToImplementor` per affected scene |
| Error fix ("fix the typecheck error in scene 2") | call `delegateToImplementor(2)` only |

Rules of thumb:

- direct Implementor path only for exact, unambiguous changes or known errors
- Art Director path for feel, layout, style, pacing, or ambiguous creative direction
- if classification is unclear, ask one clarifying question before delegating
- the Planner may emit `delegateToImplementor` calls in **parallel** for independent scenes once their designs are finalized

## Planner Setup

```ts
import { Agent } from '@mastra/core/agent'
import { setBriefTool, setRoutingTool } from '../memory/access'
import { retrieveProjectKnowledge } from '../knowledge/retrieve'
import { delegateToArtDirector, delegateToImplementor } from './delegations'

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `...`,                         // see "Instructions To Write"
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {
    setBrief: setBriefTool,                    // role-bound to 'planner'
    setRouting: setRoutingTool,                // role-bound to 'planner'
    retrieveProjectKnowledge,                  // RAG
    delegateToArtDirector,                     // subagent dispatch
    delegateToImplementor,                     // subagent dispatch
  },
})
```

Memory helpers are exposed as tools with the role pre-bound, so the agent literally cannot pass a different role.

## Instructions To Write

Cover:

1. **Role**: supervisor. Talk to the user, classify intent, produce the brief, and delegate.
2. **Brief output**: project goal, audience, tone, duration, assets, key messages, user preferences. Call `setBrief` to persist.
3. **Clarification**: do not produce a brief or delegate until missing essentials are known. Ask one focused question at a time.
4. **Routing**: classify each follow-up using the table above and call the matching delegation tool(s). Record the classification with `setRouting` (single-field audit log).
5. **Delegation discipline**:
   - Always wait for `delegateToArtDirector` to finish before delegating dependent Implementor work for that scene.
   - Independent Implementor scenes may be delegated in parallel.
   - On Implementor error result, decide: re-delegate to Implementor (small fix), call Art Director (design issue), or surface to user.
6. **RAG vs Memory split**:
   - Planner is the main RAG consumer
   - Workspace State holds the active working state
   - RAG feeds facts into prompts; memory persists decisions
7. **Constraints**: MVP is short product and screen-recording videos only. The Planner never writes code, never reads/writes files, never invokes sandbox tools.

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

## Delegation Tools

Each delegation tool is a Mastra `createTool` whose `execute` calls `mastra.getAgent(name).generate(...)` and emits `agent.start` / `agent.end` events on the bus.

```ts
// agents/delegations.ts (sketch)
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { bus } from '../server/bus'

export const delegateToArtDirector = createTool({
  id: 'delegate_to_art_director',
  description: 'Hand off scene-design work to the Art Director. Use when the request needs new creative direction (feel, layout, pacing, style change, or new scenes).',
  inputSchema: z.object({
    sceneNumber: z.number().optional(),  // omit to design all scenes
    note: z.string().optional(),         // optional brief context for this delegation
  }),
  execute: async ({ context, mastra }) => {
    bus.emit('agent.start', { agent: 'art-director', input: context })
    const result = await mastra.getAgent('artDirectorAgent').generate({
      messages: [{ role: 'user', content: buildArtDirectorPrompt(context) }],
    })
    bus.emit('agent.end', { agent: 'art-director', output: result.text })
    return result.text
  },
})

export const delegateToImplementor = createTool({
  id: 'delegate_to_implementor',
  description: 'Hand off code-writing work to the Implementor for one scene. Safe to call in parallel for independent scenes.',
  inputSchema: z.object({
    sceneNumber: z.number(),
    note: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    bus.emit('agent.start', { agent: 'implementor', sceneNumber: context.sceneNumber })
    const result = await mastra.getAgent('implementorAgent').generate({
      messages: [{ role: 'user', content: buildImplementorPrompt(context) }],
    })
    bus.emit('agent.end', { agent: 'implementor', sceneNumber: context.sceneNumber, output: result.text })
    return result.text
  },
})
```

## Parallelism

Once the Art Director finishes designing all scenes, the Planner can dispatch Implementor work concurrently:

```
Planner → delegateToImplementor(scene=1)  ─┐
       → delegateToImplementor(scene=2)  ─┼── run concurrently (AI SDK parallel tool calls)
       → delegateToImplementor(scene=3)  ─┘
```

What is **not** parallel-safe:

- Art Director must finish before any Implementor call for that scene (Implementor reads `sceneRegistry[n].design`).
- Two Implementor calls on the same scene number (race on `sceneRegistry[n].status`).
- Anything before the Planner has classified the request.

## Memory Handoff

Subagents read and write Workspace State through their own role-correct helpers from `memory/access.ts`. Delegation tools do not touch memory directly — they only invoke the agent and stream events.

```
Planner                        Art Director                   Implementor
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│ reads:       │              │ reads:       │              │ reads:       │
│  user input  │              │  brief       │              │  scene       │
│  RAG facts   │              │  styleContext│              │  design      │
│              │              │              │              │  styleContext│
│ writes:      │              │ writes:      │              │              │
│  brief       │              │  styleContext│              │ writes:      │
│  routing     │              │  sceneRegistry│             │  sceneRegistry│
│              │              │  [n].design  │              │  [n].status  │
└──────────────┘              └──────────────┘              │  [n].filePath│
                                                            │  [n].errors  │
                                                            └──────────────┘
```

Handoff rules:

1. **Planner owns memory initialization.** Creates the brief, sets routing classification.
2. **Art Director reads then writes.** Reads brief and current `styleContext`, writes `styleContext` and `sceneRegistry[n].design`.
3. **Implementor reads then writes.** Reads scene design and `styleContext`, writes `sceneRegistry[n].status`, `.filePath`, and `.errors`.
4. **Field ownership is enforced by `memory/access.ts`.** Wrong-role writes throw. Caught at the delegation-tool boundary and re-emitted as `field-ownership-violation` events.

## Event Bus

A tiny in-process pub/sub. Phase 4 builds the SSE route on top of this — for now, only the in-process API matters.

```ts
// server/bus.ts (sketch)
import { EventEmitter } from 'node:events'

export type BusEvent =
  | { type: 'agent.start'; agent: string; sceneNumber?: number; input?: unknown }
  | { type: 'agent.end';   agent: string; sceneNumber?: number; output?: unknown }
  | { type: 'agent.error'; agent: string; error: string }
  | { type: 'scene.update'; sceneNumber: number; status: string }
  | { type: 'field-ownership-violation'; field: string; role: string; expectedRole: string }

export const bus = new EventEmitter()
```

Where events come from:

- Delegation tools emit `agent.start` / `agent.end`.
- The Implementor's scene-status helpers in `memory/access.ts` emit `scene.update`.
- Access-layer throws emit `field-ownership-violation`.

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

The Planner is wired with both delegation tools. The Art Director and Implementor are exposed as agents so `mastra.getAgent(name).generate(...)` works from the delegation tools. The `/chat/artDirectorAgent` and `/chat/implementorAgent` endpoints exist for direct testing only.

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
- Planner produces a brief, then emits tool calls to `delegate_to_art_director` and `delegate_to_implementor` (visible in the response trace).
- Art Director writes `styleContext` and scene designs.
- Implementor writes scene code and updates statuses.
- Bus emits matching `agent.start` / `agent.end` events.

**2. Tweak routing.**

```powershell
curl -X POST http://localhost:4111/chat/plannerAgent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make the title bigger\"}]}"
```

Expected: Planner emits only `delegate_to_implementor`. Art Director is not invoked.

## Reference

- [`phase-3-memory-knowledge-uploads.md`](phase-3-memory-knowledge-uploads.md) — `setBrief`, `setRouting`, role-guarded helpers, `retrieveProjectKnowledge`
- [`phase-3-art-director-agent.md`](phase-3-art-director-agent.md) — subagent invoked via `delegateToArtDirector`
- [`phase-3-implementor-agent.md`](phase-3-implementor-agent.md) — subagent invoked via `delegateToImplementor`
- `docs/SETUP_GUIDE.md`
- `docs/project-knowledge-and-skills.md`
- Mastra agents: <https://mastra.ai/docs/agents/overview>
- Mastra subagents (agent-as-tools): <https://mastra.ai/docs/agents/agent-as-tools>
- AI SDK parallel tool calls: <https://ai-sdk.dev/docs/foundations/tools>
