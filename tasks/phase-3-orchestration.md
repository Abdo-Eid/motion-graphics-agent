# Phase 3 — Orchestration

## Your Role

Build the **orchestration system** that wires the three agents together — Planner, Art Director, Implementor — with correct ordering, routing, memory handoff, and parallelism.

This is not an agent. This is the glue layer that makes the pipeline work as a system.

## Execution Order

### Initial generation (full pipeline)

```text
User -> Planner -> Art Director -> Implementor -> Preview
```

Steps execute **sequentially**. Each step must complete before the next starts.

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | Planner | User message | Structured brief |
| 2 | Art Director | Brief + current styleContext | Per-scene design data |
| 3 | Implementor | Scene design + styleContext + skills | Remotion code |
| 4 | Preview | Generated files | Live render |

### Incremental edits (routing)

The Planner classifies follow-up requests and skips unnecessary steps.

| User request | Classification | Route | Steps skipped |
|---|---|---|---|
| "Make the title bigger" | Exact tweak | Planner -> Implementor | Art Director |
| "Change intro animation to feel more energetic" | Creative change | Planner -> Art Director -> Implementor | None |
| "Add a new scene about pricing" | Major restructure | Planner -> Art Director -> Implementor | None |
| "Use blue instead of red" | Style change | Planner -> Art Director -> Implementor | None |
| "Fix the typecheck error in scene 2" | Error fix | Planner -> Implementor | Art Director |

Routing rules:

- direct Implementor path only for exact, unambiguous changes or known errors
- Art Director path for feel, layout, style, pacing, or ambiguous creative direction
- if classification is unclear, Planner should ask one clarifying question before routing

## Parallelism

### What can run in parallel

```text
Art Director (scene N)   ──┐
Art Director (scene N+1) ──┼── sequential (each scene depends on styleContext)
                           │
Implementor (scene N)     ──┐   once all designs are done,
Implementor (scene N+1)   ──┼── scenes CAN be implemented in parallel
                           │
                           └── Future optimization (MVP runs sequentially)
```

For MVP, everything runs sequentially. The architecture is designed so that parallelism can be added later:

- **Art Director scenes**: could run in parallel if styleContext is locked before scene design begins
- **Implementor scenes**: could run in parallel once designs are finalized since each scene is an independent component
- **Planner**: always runs first — nothing else starts without a brief or routing decision

### What cannot run in parallel

- Planner must complete before Art Director or Implementor start
- Art Director must complete a scene design before Implementor implements that scene
- Implementor must typecheck before marking a scene as built

## Memory Handoff

Memory flows through the pipeline as agents read and write shared structures.

```text
Planner                        Art Director                   Implementor
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│ reads:       │              │ reads:       │              │ reads:       │
│  user input  │   brief     │  brief       │  scene      │  scene       │
│  RAG facts   │─────────────>│  styleContext │  design     │  design      │
│              │              │  RAG assets  │─────────────>│  styleContext│
│ writes:      │              │              │              │  skills      │
│  brief       │              │ writes:      │              │              │
│  routing     │              │  styleContext │              │ writes:      │
│  memory owner│              │  sceneRegistry│              │  sceneRegistry│
└──────────────┘              │  [n].design  │              │  [n].status  │
                             └──────────────┘              │  [n].filePath│
                                                           │  [n].errors  │
                                                           └──────────────┘
```

### Handoff rules

1. **Planner owns memory initialization.** It creates the brief and initializes empty `styleContext` and `sceneRegistry`.
2. **Art Director reads then writes.** It reads the brief and current `styleContext`, then overwrites `styleContext` and writes `sceneRegistry[n].design`.
3. **Implementor reads then writes.** It reads scene design and `styleContext`, then writes `sceneRegistry[n].status`, `.filePath`, and `.errors`.
4. **No agent overwrites another agent's fields.** Planner never writes design data. Art Director never writes build status. Implementor never writes creative direction.

## Where To Work

- `mastra/src/mastra/index.ts` — agent registration and route wiring
- `mastra/src/mastra/memory/` — shared memory structures and access patterns
- `mastra/src/mastra/workflow/` — orchestration logic (routing, ordering, handoff)

## Registration Pattern

```ts
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

## Memory Structure

```ts
interface ProjectMemory {
  brief: PlannerBrief
  styleContext: StyleContext
  sceneRegistry: SceneRecord[]
  routing: RoutingDecision
}
```

Field ownership:

| Field | Owned by | Pattern |
|---|---|---|
| `brief` | Planner | overwrite |
| `styleContext` | Art Director | overwrite |
| `sceneRegistry[n].design` | Art Director | write once per scene |
| `sceneRegistry[n].status` | Implementor | overwrite |
| `sceneRegistry[n].filePath` | Implementor | overwrite |
| `sceneRegistry[n].errors` | Implementor | overwrite |
| `routing` | Planner | overwrite |

## RAG vs Memory in Orchestration

- **RAG** provides the facts: uploaded docs, parsed CSV results, asset metadata, current-project artifacts
- **Memory** holds the working state: brief, styleContext, sceneRegistry, errors, routing
- **Orchestration** decides when each system is consulted

```text
User message arrives
  │
  ├─ need facts from files/data? ──> RAG retrieval
  ├─ need current project state?  ──> Memory read
  │
  ▼
Planner classifies and routes
  │
  ▼
Selected agents execute, read/write memory
  │
  ▼
Memory updated, preview syncs
```

## Checkpoint

Run:

```bash
bun run dev:mastra
```

Test full pipeline:

```powershell
curl -X POST http://localhost:4111/chat/planner-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make a 20-second product demo for a note-taking app\"}]}"
```

Test routing (tweak):

```powershell
curl -X POST http://localhost:4111/chat/planner-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make the title bigger\"}]}"
```

Expected results:

- Full pipeline: Planner produces brief, Art Director produces scene designs, Implementor produces code
- Tweak routing: Planner routes directly to Implementor without Art Director
- Memory handoff: each agent reads the correct fields and writes only its owned fields

## Related Tasks

- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — build the Planner agent
- [`phase-3-art-director-agent.md`](phase-3-art-director-agent.md) — build the Art Director agent
- [`phase-3-implementor-agent.md`](phase-3-implementor-agent.md) — build the Implementor agent

## Reference

- [`docs/editing agent.md`](../docs/editing%20agent.md) — architecture, routing rules, memory structures
- [`docs/project-knowledge-and-skills.md`](../docs/project-knowledge-and-skills.md) — RAG pipelines, memory separation
- [`docs/SETUP_GUIDE.md`](../docs/SETUP_GUIDE.md) — implementation phases and checkpoints
