# Phase 3 — Art Director Agent

> **Architecture note.** Invoked as a subagent by the Planner via `delegateToArtDirector`. See [`phase-3-planner-agent.md`](phase-3-planner-agent.md) for the supervisor + delegation-tool wiring.

## Your Role

Build the **Art Director agent**. The creative design layer.

The Art Director turns a Planner brief into scene-by-scene design direction. It does not write code and does not use sandbox tools. It is invoked through the Planner's delegation tool — the `/chat/artDirectorAgent` endpoint exists for direct testing only.

## What the Art Director Does

- receives the Planner brief
- reads shared `styleContext` before designing
- creates scene designs with composition, hierarchy, pacing, animation feel, and transition direction
- updates shared `styleContext` when the creative direction evolves
- uses RAG to retrieve brand facts and asset metadata for scene design
- writes scene design data into `sceneRegistry`

Memory:
- reads `styleContext` and `sceneRegistry` from working memory
- writes updates back to `styleContext` and `sceneRegistry`

Its output should be implementation-ready without naming Remotion APIs.

## Where To Work

- `mastra/src/mastra/agents/art-director.ts`
- register it in `mastra/src/mastra/index.ts`

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'

export const artDirectorAgent = new Agent({
  id: 'art-director-agent',
  name: 'Art Director',
  instructions: `...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

## Instructions To Write

Your instructions should define:

1. **Role**: creative director for scene design and style consistency
2. **Input**: Planner brief plus current shared style context
3. **Output**: per-scene design with purpose, composition, visual hierarchy, animation feel, transition direction, assets, and acceptance criteria
4. **Constraints**:
   - no code
   - no sandbox tools
   - no Remotion API references
   - preserve style consistency across scenes
5. **Shared memory behavior**:
   - update `styleContext` when creative decisions become explicit
   - write scene design records into `sceneRegistry`

The output should describe animation in feel-based motion language, not API language. For example:

- "Confident entrance with no overshoot"
- "Quick energetic slide-in from the left"
- "Gentle fade with subtle scale-up"

## Example Output Shape

```json
{
  "sceneNumber": 1,
  "name": "Intro",
  "purpose": "Introduce the product with immediate clarity",
  "composition": {
    "layout": "Centered title with supporting subtitle",
    "hierarchy": "Title dominates, subtitle secondary"
  },
  "animation": {
    "entrance": "Confident fade-up with minimal overshoot",
    "exit": "Fast horizontal wipe into the next scene"
  },
  "acceptanceCriteria": [
    "Readable within the first second",
    "Feels clean and confident"
  ]
}
```

## Checkpoint

Run:

```bash
bun run dev:mastra
```

Test:

```powershell
curl -X POST http://localhost:4111/chat/art-director-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Design three scenes for a short note-taking app promo based on this brief\"}]}"
```

Expected result: the response should describe scene design clearly without writing code.

## Reference

- `docs/SETUP_GUIDE.md`
- `docs/project-knowledge-and-skills.md`
- [`phase-3-planner-agent.md`](phase-3-planner-agent.md) — supervisor + delegation tools (how the Planner invokes this agent)
