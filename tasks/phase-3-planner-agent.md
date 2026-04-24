# Phase 3 — Planner Agent

## Your Role

Build the **Planner agent**. It is the entry point for the user conversation and the owner of intake, clarification, memory, and routing.

In the new architecture, the Planner produces a structured **brief** that the Art Director uses to design scenes.

## Responsibilities

- receive user intent
- ask clarifying questions when constraints are missing
- produce a concise structured brief
- manage private memory and shared project context ownership
- uses RAG to retrieve relevant project knowledge from uploaded docs, data, and assets
- classify follow-up edits and route them correctly

Routing rules:

- exact tweak -> Implementor directly
- creative change -> Art Director -> Implementor
- major restructure -> full pipeline

## Where To Work

- `mastra/src/mastra/agents/planner.ts`
- register it in `mastra/src/mastra/index.ts`

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

## Instructions To Write

Your instructions should define:

1. **Role**: conversation, clarification, briefing, routing
2. **Output**: a structured brief with project goal, audience, tone, assets, key messages, timing constraints, and user preferences
3. **Clarification behavior**: do not generate a brief until missing essentials are known
4. **Routing behavior**: classify follow-up edits into direct Implementor changes vs Art Director-led redesign
5. **RAG vs Memory split**:
   - Planner is the main RAG consumer
   - Planner owns the working memory (brief, routing, shared context)
   - RAG feeds facts into memory; memory stores the active working state
6. **Constraints**: MVP is short product and screen-recording videos only

Use a brief shape that covers:

- project goal
- audience
- tone
- duration
- assets
- key messages
- user preferences

The Planner should never write code and never call sandbox tools.

## Checkpoint

Run:

```bash
bun run dev:mastra
```

Test:

```powershell
curl -X POST http://localhost:4111/chat/planner-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make a 20-second product demo for a note-taking app\"}]}"
```

Expected result:

- the Planner asks a clarifying question if needed, or
- it returns a brief rather than a scene-by-scene code plan

## Reference

- `docs/SETUP_GUIDE.md`
- `docs/project-knowledge-and-skills.md`
- [`phase-3-orchestration.md`](phase-3-orchestration.md) — ordering, routing, memory handoff, parallelism
