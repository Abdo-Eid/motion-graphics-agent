# Phase 3 — Planner Agent

## Your Role

You're building the **Planner agent** — the entry point for all user interactions. The planner receives user intent, asks clarifying questions if needed, and produces a structured scene plan that the Editor and Motion agents will consume later.

---

## What the Planner Does

- Receives the user's goal (e.g. "Make a 30-second product demo highlighting these features")
- Asks for missing inputs or assets if the request is vague
- Produces a **scene plan** — a high-level description of what each scene should do (not code)
- Manages context: style preferences, past decisions, uploaded assets
- Eventually routes work to Editor and Motion agents (agent-to-agent handoff comes later — for now just produce the plan)

The planner does **not** write code. It does **not** call sandbox tools. It thinks and communicates.

---

## Where to Work

- Your agent file: `mastra/src/mastra/agents/planner.ts`
- You'll also need to register it in `mastra/src/mastra/index.ts` (coordinate with the integration person on this)

The `agents/` directory doesn't exist yet — create it:
```powershell
New-Item -ItemType Directory -Force -Path mastra/src/mastra/agents
```

---

## Agent Setup

Use Mastra's built-in `zai-coding-plan` provider — no extra provider package needed. Auth reads `ZHIPU_API_KEY` from the root `.env` automatically.

```ts
import { Agent } from '@mastra/core/agent'

export const plannerAgent = new Agent({
  id: 'planner-agent',
  name: 'Planner',
  instructions: `...your instructions...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

### Available Models

| Model | Notes |
|---|---|
| `glm-5.1` | Latest flagship |
| `glm-5` | Flagship, agent-optimized |
| `glm-4.7` | High-performance |
| `glm-4.7-flash` | Fast, good for POC (recommended) |
| `glm-4.7-flashx` | Fast extended |
| `glm-4.6` | Previous-gen flagship |

Accessed via the string `'zai-coding-plan/<model>'`. No import needed.

---

## Instructions to Write

The `instructions` string is the system prompt that shapes the planner's behavior. This is the core deliverable. It should define:

1. **Role** — You are a video production planner. You receive user intent and produce structured scene plans for a Remotion-based video editor.
2. **Output format** — The scene plan should be structured (JSON or numbered sections). Each scene needs: scene number, duration (in frames at 30fps), description of what happens, assets needed, text/overlays.
3. **Clarification behavior** — If the user's request is vague, ask specific questions before planning (target audience? tone? assets available? key messages?). Don't plan until you have enough info.
4. **Constraints** — Total video: 20–30 seconds (600–900 frames at 30fps). Screen recordings + product demos only for MVP. No complex 3D or custom audio.
5. **Communication style** — Concise, professional. Present the plan clearly. Use frame counts and timing.

Write a thorough instructions string. Test it by sending different prompts through the chat endpoint and seeing how the planner responds. Iterate on the instructions until the output is consistently good.

---

## Tools

For now, `tools: {}` — the planner has no sandbox tools. It only reasons and communicates. Tools may be added later (e.g. to read uploaded asset metadata).

---

## Registering the Agent

Coordinate with whoever is setting up `index.ts`. The final `mastra/src/mastra/index.ts` should look like:

```ts
import { Mastra } from '@mastra/core/mastra'
import { chatRoute } from '@mastra/ai-sdk'
import { plannerAgent } from './agents/planner'
import { editorAgent } from './agents/editor'
import { motionAgent } from './agents/motion'

export const mastra = new Mastra({
  agents: { plannerAgent, editorAgent, motionAgent },
  server: {
    apiRoutes: [
      chatRoute({ path: '/chat/:agentId' }),
    ],
  },
})
```

The `chatRoute()` creates endpoints like `/chat/planner-agent` — the `:agentId` maps to the agent's `id` field. The frontend's `useChat()` will hit `http://localhost:4111/chat/planner-agent`.

---

## Checkpoint

`cd mastra && bun run dev` → server starts on `:4111`, no errors. You can test via curl:

```powershell
curl -X POST http://localhost:4111/chat/planner-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Make a 20-second product demo for a note-taking app\"}]}"
```

Should stream back a scene plan response.

---

## Reference

- Project architecture: `docs/editing agent.md` — read the "Multi-Agent System" and "Planner / Orchestrator" sections
- Mastra Z.AI provider: https://mastra.ai/models/providers/zai-coding-plan
- Setup guide Phase 3: `docs/SETUP_GUIDE.md`
- Mastra `@mastra/core` package: already installed in `mastra/package.json`
- `@mastra/ai-sdk` package: already installed (provides `chatRoute()`)
