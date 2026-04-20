# Phase 3 — Editor Agent

## Your Role

You're building the **Editor agent** — the code writer. It receives a scene plan from the Planner, loads relevant Remotion skill docs, and writes actual `.tsx` Remotion composition files. It then runs the TypeScript compiler and fixes errors in a loop until the code is clean.

For now, the sandbox tools (`read_file`, `edit_file`, `run_typecheck`, etc.) aren't wired up yet (that's Phase 4-5). You're defining the agent's instructions and structure so it's ready to receive those tools when they arrive.

---

## What the Editor Does

- Receives a scene plan (structured output from the Planner)
- Calls `list_skills()` / `load_skill()` to read Remotion API docs before writing code
- Reads the existing project scaffold (helpers, utilities)
- Writes Remotion `<Composition>` and individual scene `.tsx` files
- Sequences assets, defines timing and structure
- Runs `run_typecheck()` after each edit; fixes errors with follow-up `edit_file` calls
- Loops on compiler feedback until the code is clean

The editor writes **real React/Remotion code**, not JSON configs or templates. Example output:

```tsx
export const FeatureCallout = ({ text, startFrame }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - startFrame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ opacity }}>
      <div className="callout-box">{text}</div>
    </AbsoluteFill>
  );
};
```

---

## Where to Work

- Your agent file: `mastra/src/mastra/agents/editor.ts`
- Register in `mastra/src/mastra/index.ts` (coordinate with the integration person)

Create the directory if it doesn't exist:
```powershell
New-Item -ItemType Directory -Force -Path mastra/src/mastra/agents
```

---

## Agent Setup

```ts
import { Agent } from '@mastra/core/agent'

export const editorAgent = new Agent({
  id: 'editor-agent',
  name: 'Editor',
  instructions: `...your instructions...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

Same provider setup as the planner — `'zai-coding-plan/glm-4.7-flash'` string, reads `ZHIPU_API_KEY` from `.env` automatically.

---

## Instructions to Write

The `instructions` string is the core deliverable. It should define:

1. **Role** — You are a Remotion video editor. You receive scene plans and write production-quality TypeScript/React code using the Remotion framework.

2. **Workflow** — Your edit process must follow this loop:
   - Load skills first (`list_skills` → `load_skill("remotion")`)
   - Read existing files to understand the current state
   - Write/edit files using `edit_file` (search-and-replace) or `create_file` (new files)
   - Run `run_typecheck()` after edits
   - If errors: read the flagged lines with `read_file`, produce a fix with `edit_file`, re-check
   - Repeat until clean

3. **Code conventions** — Agents start from a scaffold with shared utilities. They should:
   - Use `AbsoluteFill` as the root container
   - Use `useCurrentFrame()` and `useVideoConfig()` for animation timing
   - Use `spring()` for animations (not manual `interpolate` unless needed)
   - Use Tailwind classes for styling
   - Keep each scene as a separate component in `src/scenes/`

4. **File structure** — The Remotion project inside the sandbox follows this layout:
   ```
   /workspace/
   ├── src/
   │   ├── Root.tsx          ← <Composition> registry
   │   ├── scenes/
   │   │   ├── Intro.tsx
   │   │   ├── FeatureCallout.tsx
   │   │   └── Outro.tsx
   │   └── utils/
   │       └── animations.ts
   └── package.json
   ```

5. **Edit discipline** — Use `edit_file` (search-and-replace), never rewrite entire files. Include 2–3 lines of surrounding context in `old_string` for uniqueness. Only use `create_file` for new files.

6. **Constraints** — 30fps, 20–30 second videos. No external API calls in compositions. No file system access in compositions (they run in the browser via Remotion Player).

Write thorough instructions. The quality of the agent's output depends heavily on this prompt.

---

## Tools

Set `tools: {}` for now. When Phase 5 wires the sandbox via MCP, these tools will be injected:

| Tool | What it does | How the Editor uses it |
|---|---|---|
| `read_file(path, offset?, limit?)` | Read file contents | Check current file state before editing |
| `edit_file(path, old_string, new_string)` | Search-and-replace edit | Primary write tool |
| `create_file(path, content)` | Create new file | Only for new scene files |
| `list_files(dir)` | List directory tree | Explore project structure |
| `grep(pattern)` | Search across files | Find specific functions or imports |
| `list_skills()` | List available skill docs | Discover what documentation is available |
| `load_skill(name)` | Load a skill document | Read Remotion API docs before writing |
| `run_typecheck()` | Run `tsc --noEmit` | Verify code compiles, get error feedback |
| `run_render_check()` | Headless render first frames | Catch runtime errors typechecker misses |

The agent's instructions should reference these tools by name so the model knows to call them when they become available.

---

## Registering the Agent

Coordinate with whoever sets up `index.ts`. See the integration pattern in `tasks/phase-3-planner-agent.md`.

---

## Checkpoint

`cd mastra && bun run dev` → server starts on `:4111`, agent appears in logs. Test:

```powershell
curl -X POST http://localhost:4111/chat/editor-agent -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Create a 3-scene intro video: scene 1 fades in a title, scene 2 shows a feature list, scene 3 is an outro with a logo\"}]}"
```

Should respond (it won't have tools yet, so it'll describe what it would do — that's fine).

---

## Reference

- Project architecture: `docs/editing agent.md` — read "Multi-Agent System", "Editor Agent", "The Sandbox", and "What the Agents Write"
- Sandbox tool spec: `docs/editing agent.md` — "File Reading Tools", "File Writing Tools", "Skill Tools", "Execution & Feedback Tools"
- Docker sandbox architecture: `docs/Building a Local Docker Sandbox for Agentic Apps.md` — explains how MCP tools get injected
- Setup guide Phase 3: `docs/SETUP_GUIDE.md`
- Mastra Z.AI provider: https://mastra.ai/models/providers/zai-coding-plan
