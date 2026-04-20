# Phase 3 — Motion Agent + Integration

## Your Role

You have **two responsibilities**:

1. Build the **Motion agent** — adds animations, transitions, and effects to the Editor's compositions
2. **Integrate all three agents** into `mastra/src/mastra/index.ts` with `chatRoute()`

Coordinate with the Planner and Editor agent owners — they're creating `planner.ts` and `editor.ts` in the same `agents/` directory.

---

## What the Motion Agent Does

- Reads the Editor's compositions after the Editor is done
- Loads motion-related skills (`remotion-transitions`, animation patterns)
- Adds motion graphics: `spring()` animations, zoom/pan, text entrances, transitions between scenes, highlight effects
- Works at the animation layer — edits existing files rather than creating new ones
- Runs the same typecheck feedback loop as the Editor
- Optionally runs `run_render_check()` at the end to catch runtime errors

The Motion agent is an **editor, not a creator**. It takes the Editor's code and enhances it with animation. It should never create new files — only `edit_file` calls.

---

## Where to Work

- Motion agent file: `mastra/src/mastra/agents/motion.ts`
- Integration file: `mastra/src/mastra/index.ts`

Create the directory if needed:
```powershell
New-Item -ItemType Directory -Force -Path mastra/src/mastra/agents
```

---

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'

export const motionAgent = new Agent({
  id: 'motion-agent',
  name: 'Motion',
  instructions: `...your instructions...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

Same provider as the other agents — `'zai-coding-plan/glm-4.7-flash'`, `ZHIPU_API_KEY` from `.env`.

---

## Motion Agent Instructions

The `instructions` string should define:

1. **Role** — You are a motion designer. You enhance existing Remotion compositions with animations, transitions, and visual effects.

2. **Workflow** — Always:
   - Load relevant skills first (`load_skill("remotion-transitions")`)
   - Read the existing composition files the Editor wrote
   - Apply animations and transitions using `edit_file` (never `create_file`)
   - Run `run_typecheck()` after edits
   - Fix errors in a loop until clean

3. **Animation patterns to know** — The instructions should teach the agent about:
   - `spring()` for natural-feeling animations (entrances, bounces)
   - `interpolate()` for linear/non-linear value mapping
   - `Sequence` and `Series` for timing scenes
   - `TransitionSeries` with slide, fade, flip transitions between scenes
   - Text entrance effects: typewriter, fade-up, scale-in
   - Highlight effects: box highlight, underline sweep, zoom

4. **Constraints** — Only edit existing files. Never create new files. Respect the timing and structure the Editor defined. Keep animations subtle for a professional look (avoid excessive bouncy/springy effects). Use Tailwind classes where possible.

5. **Edit discipline** — Same as Editor: `edit_file` with search-and-replace, 2–3 lines of context in `old_string`, never rewrite full files.

---

## Integration (`index.ts`)

You own the Mastra server setup. Edit `mastra/src/mastra/index.ts` to register all three agents and expose the chat endpoint.

The current file is:
```ts
import { Mastra } from '@mastra/core/mastra';
export const mastra = new Mastra()
```

Replace with:

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

### How `chatRoute()` works

`chatRoute()` from `@mastra/ai-sdk` creates an HTTP endpoint at the given path. With `{ path: '/chat/:agentId' }`, it generates:

- `POST /chat/planner-agent` → streams from `plannerAgent`
- `POST /chat/editor-agent` → streams from `editorAgent`
- `POST /chat/motion-agent` → streams from `motionAgent`

The `:agentId` parameter maps to the agent's `id` field. The response is an SSE stream compatible with `useChat()` from `@ai-sdk/react`.

The `@mastra/ai-sdk` package is already installed in `mastra/package.json`.

---

## Tools

Set `tools: {}` for now — same as the other agents. When Phase 5 wires the sandbox, the same MCP tools get injected into the Motion agent:

| Tool | How Motion uses it |
|---|---|
| `read_file` | Read the Editor's compositions before modifying |
| `edit_file` | Add animations and transitions to existing code |
| `list_files` | Find all scene files |
| `load_skill` | Load `remotion-transitions.md` before editing |
| `run_typecheck` | Verify edits compile |
| `run_render_check` | Final check — headless render to catch runtime errors |

---

## Coordination

- **Planner owner** is creating `agents/planner.ts`
- **Editor owner** is creating `agents/editor.ts`
- You create `agents/motion.ts` and own `index.ts`
- Wait until all three agent files exist before testing the full integration
- All three agents can be developed in parallel — they don't depend on each other's code, just the shared `index.ts`

---

## Checkpoint

`cd mastra && bun run dev` → starts on `:4111`, all three agents appear in logs. Test each:

```powershell
curl -X POST http://localhost:4111/chat/motion-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Add a fade transition between scene 1 and scene 2\"}]}"
```

```powershell
curl -X POST http://localhost:4111/chat/planner-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Plan a 20-sec product demo\"}]}"
```

All three endpoints should respond with streamed text.

---

## Reference

- Project architecture: `docs/editing agent.md` — read "Multi-Agent System", "Motion Agent", and the full architecture section
- Setup guide Phase 3: `docs/SETUP_GUIDE.md` — has the exact `index.ts` pattern
- Mastra `chatRoute()`: https://mastra.ai — check docs for `@mastra/ai-sdk` usage
- Mastra Z.AI provider: https://mastra.ai/models/providers/zai-coding-plan
- Sandbox tool spec: `docs/editing agent.md` — "Skill Tools", "Execution & Feedback Tools"
