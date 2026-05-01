# Multi-Agent Architecture — Original Split (Legacy)

> **Historical reference only — do not implement against this.** Documents the original Planner / Editor / Motion split which was superseded by the current Planner / Art Director / Implementor design. Kept because the "Known Issues" at the end of this doc are exactly what motivated the rewrite. For the current architecture see `PROJECT_OVERVIEW.md` and `docs/architecture.md`.

---

## Overview

A 3-agent linear pipeline:

```
Planner (scene plan) → Editor (code + structure) → Motion (animations + transitions)
```

| Agent | id | Has Memory | Has Tools | Role |
|---|---|---|---|---|
| Planner | `planner-agent` | Yes | No (future) | Intake, clarification, full scene planning, context management |
| Editor | `editor-agent` | No | Yes (MCP) | Reads plan, loads skills, writes .tsx files, typecheck loop |
| Motion | `motion-agent` | No | Yes (MCP) | Reads Editor's files, adds animations/transitions, typecheck loop |

---

## Why This Split Was Originally Chosen

- **Planner** handles all user interaction — conversation, clarification, memory, scene planning
- **Editor** owns the code — builds the video structure, layout, styling, and timing
- **Motion** owns the animation — adds visual polish on top of the Editor's base code
- Clear separation of concerns: conversation / code / animation
- Each agent loops on the compiler feedback cycle until its output is clean before handing off

---

## Agent 1 — Planner

### Responsibility

The entry point for all user interactions. Understands intent, asks clarifying questions, produces structured scene plans, and manages memory.

### What it does

- Receives user intent (e.g. "Make a 30-second product demo highlighting these features")
- Asks for missing inputs or assets if the request is vague:
  - Target audience?
  - Tone?
  - Assets available?
  - Key messages?
- Does NOT plan until enough info is gathered
- Produces a **full scene plan** — a structured description of what each scene should do:
  - Scene number, name, and purpose
  - Duration (in frames at 30fps)
  - Description of what happens in the scene
  - Assets needed per scene
  - Text/overlays per scene
  - Timing and sequence across all scenes
- Manages all memory:
  - Short-term scratchpad (current session state, file structure, compiler errors)
  - Long-term user profile (style preferences, past decisions)
  - Semantic recall (RAG over past conversations)
- Routes work to Editor and Motion agents

### What it does NOT do

- Does NOT write code
- Does NOT call sandbox tools
- Does NOT make animation or visual design decisions

### Skills

None — the Planner is a conversational agent with no code output.

### Memory

| Layer | Scope | What it stores |
|---|---|---|
| Message History | Thread | Recent conversation messages |
| Working Memory (thread) | Per session | Scene plan status, assets, file structure, compiler errors |
| Working Memory (resource) | Per user | Style preferences, colors, fonts, motion feel, past decisions |
| Semantic Recall | Per user | RAG over past conversations for "make it like last time" |

Only the Planner has memory. Editor and Motion are stateless workers.

### Output format

```json
{
  "scenes": [
    {
      "scene": 1,
      "name": "Intro",
      "duration": "150 frames (5 seconds)",
      "description": "Fade in the product name with a bold title. Subtle gradient background.",
      "assets": [],
      "text": ["NoteFlow", "Capture. Organize. Share."]
    },
    {
      "scene": 2,
      "name": "Features",
      "duration": "300 frames (10 seconds)",
      "description": "Show three product benefits as a list with icons. Each item appears one by one.",
      "assets": [{ "type": "screenshot", "path": "/assets/dashboard.png" }],
      "text": ["Capture notes instantly", "Organize with AI tags", "Share with your team"]
    },
    {
      "scene": 3,
      "name": "Outro",
      "duration": "150 frames (5 seconds)",
      "description": "Show the logo and a call-to-action button.",
      "assets": [{ "type": "logo", "path": "/assets/logo.png" }],
      "text": ["Get started free"]
    }
  ],
  "totalDuration": "600 frames (20 seconds)",
  "style": {
    "motionFeel": "smooth, confident",
    "colorPalette": ["#1a1a2e", "#16213e", "#e94560"]
  }
}
```

---

## Agent 2 — Editor

### Responsibility

The code writer. Receives the Planner's scene plan, loads Remotion skill docs, writes `.tsx` composition files, and runs the typecheck loop until code is clean.

### What it does

- Receives the scene plan from the Planner
- Calls `list_skills()` / `load_skill()` to read Remotion API docs before writing code
- Reads the existing project scaffold (helpers, utilities)
- Writes the main Remotion `<Composition>` and individual scene `.tsx` files
- Sequences assets, defines timing and structure
- Owns the base layout, styling, and component structure
- Applies Tailwind classes for styling
- Runs `run_typecheck()` after each edit
- Fixes errors with follow-up `edit_file` calls
- Loops on compiler feedback until the code is clean
- Uses `edit_file` (search-and-replace) for modifications, `create_file` only for new files
- Never rewrites entire files — surgical edits with 2-3 lines of context

### What it does NOT do

- Does NOT add animations (that's the Motion agent's job)
- Does NOT add transitions between scenes
- Does NOT manage memory or conversation
- Does NOT make creative direction decisions — follows the Planner's scene plan

### Code conventions

- Use `AbsoluteFill` as the root container
- Use `useCurrentFrame()` and `useVideoConfig()` for animation timing
- Use `spring()` for animations (not manual `interpolate` unless needed)
- Use Tailwind classes for styling
- Keep each scene as a separate component in `src/scenes/`

### Skills

| Skill | When loaded | What it provides |
|---|---|---|
| `remotion.md` | Always | `useCurrentFrame`, `spring`, `interpolate`, `AbsoluteFill`, `Sequence`, `useVideoConfig` |
| `tailwind.md` | Always | Tailwind classes available in Remotion compositions |
| `remotion-audio.md` | Only for audio scenes | `Audio`, `useAudioData`, `visualizeAudio` |
| `supabase-storage.md` | When referencing uploaded assets | How to reference uploaded assets by URL |

### Tools

| Tool | How the Editor uses it |
|---|---|
| `read_file(path, offset?, limit?)` | Check current file state before editing |
| `edit_file(path, old_string, new_string)` | Primary write tool — search-and-replace edits |
| `create_file(path, content)` | Only for new scene files |
| `list_files(dir)` | Explore project structure |
| `grep(pattern)` | Find specific functions or imports |
| `list_skills()` | Discover available skill docs |
| `load_skill(name)` | Load Remotion API docs before writing |
| `run_typecheck()` | Verify code compiles, get error feedback |
| `run_render_check()` | Optional — catch runtime errors typechecker misses |

### Output

Real Remotion `.tsx` files with structure and layout, but minimal animation:

```tsx
// scenes/Intro.tsx
export const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#1a1a2e" }}>
      <div className="flex flex-col items-center justify-center h-full">
        <h1 className="text-7xl font-bold text-white">NoteFlow</h1>
        <p className="text-xl text-white/70 mt-4">Capture. Organize. Share.</p>
      </div>
    </AbsoluteFill>
  );
};
```

```tsx
// scenes/FeatureCallout.tsx
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

## Agent 3 — Motion

### Responsibility

The animation agent. Reads the Editor's compositions, loads motion skills, and adds animations, transitions, and visual effects. Works at the animation layer — edits existing files, never creates new ones.

### What it does

- Reads the Editor's compositions after the Editor is done
- Loads motion-related skills:
  - `remotion-transitions.md` — TransitionSeries, slide, fade, flip transitions
- Adds motion graphics:
  - `spring()` animations — entrances, bounces, scale effects
  - `interpolate()` — linear/non-linear value mapping for custom easing
  - Zoom/pan effects
  - Text entrance effects — typewriter, fade-up, scale-in
  - Transitions between scenes — slide, fade, flip
  - Highlight effects — box highlight, underline sweep, zoom
- Works at the **animation layer only** — edits existing files, never creates new files
- Only uses `edit_file` — never `create_file`
- Runs the same typecheck feedback loop as the Editor:
  - Edit → `run_typecheck()` → read errors → fix → repeat
- Optionally runs `run_render_check()` at the end to catch runtime errors the typechecker misses
- Keeps animations subtle for a professional look — avoids excessive bouncy/springy effects
- Respects the timing and structure the Editor defined

### What it does NOT do

- Does NOT create new files
- Does NOT change layout, structure, or component architecture
- Does NOT manage memory or conversation
- Does NOT change the Editor's timing or sequencing

### Animation patterns

The Motion agent knows these patterns from its skill docs:

| Pattern | Remotion API | Use case |
|---|---|---|
| Natural-feeling entrances | `spring()` | Elements fading in, bouncing, scaling |
| Custom easing | `interpolate()` with easing functions | Non-standard motion curves |
| Scene timing | `<Sequence>` and `<Series>` | Timing scenes within a composition |
| Scene transitions | `TransitionSeries` with slide, fade, flip | Transitions between scenes |
| Text entrances | typewriter, fade-up, scale-in | Text appearing on screen |
| Highlights | box highlight, underline sweep, zoom | Drawing attention to specific elements |

### Skills

| Skill | When loaded | What it provides |
|---|---|---|
| `remotion-transitions.md` | Always | `TransitionSeries`, slide, fade, flip transitions |
| `remotion.md` | Always | `spring`, `interpolate`, `Sequence`, `Series` for animation APIs |

### Tools

| Tool | How Motion uses it |
|---|---|
| `read_file(path, offset?, limit?)` | Read the Editor's compositions before modifying |
| `edit_file(path, old_string, new_string)` | Add animations and transitions to existing code |
| `list_files(dir)` | Find all scene files |
| `load_skill(name)` | Load `remotion-transitions.md` before editing |
| `run_typecheck()` | Verify edits compile |
| `run_render_check()` | Final check — headless render to catch runtime errors |

Note: Motion does NOT use `create_file`, `list_skills()`, or `grep()` — it only reads and edits existing files.

### Output

The same `.tsx` files, enhanced with animations:

```tsx
// scenes/Intro.tsx (after Motion agent edits)
export const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame, fps, config: { damping: 18, mass: 1 } });
  const translateY = interpolate(opacity, [0, 1], [20, 0]);
  const scale = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });

  return (
    <AbsoluteFill
      style={{
        opacity,
        background: "linear-gradient(135deg, #1a1a2e, #e94560)",
      }}
    >
      <div
        style={{
          transform: `translateY(${translateY}px) scale(${scale})`,
          position: "absolute",
          top: "30%",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1 className="text-7xl font-bold text-white">NoteFlow</h1>
        <p className="text-xl text-white/70 mt-4">Capture. Organize. Share.</p>
      </div>
    </AbsoluteFill>
  );
};
```

---

## Pipeline Flow

### Full pipeline (initial generation)

```
User → Planner (clarify → scene plan) → Editor (code) → Motion (animate) → Preview
```

1. User sends a message
2. Planner asks clarifying questions if needed, then produces a full scene plan
3. Editor receives the scene plan, loads skills, writes `.tsx` composition files, runs typecheck loop
4. Motion receives the Editor's output, loads motion skills, adds animations/transitions, runs typecheck loop
5. Remotion Player hot-reloads the preview
6. Optional: `run_render_check()` catches runtime errors after Motion finishes

### Incremental edits (after preview)

Not explicitly defined in the original design. All edits would go through the full pipeline:

```
User → Planner (classify edit) → Editor (code changes) → Motion (animation changes) → Preview
```

Or if only animation changes are needed:

```
User → Planner (classify edit) → Motion (animation changes only) → Preview
```

---

## Style Context

In the original split, style context is stored in the Planner's working memory (resource-scoped). There is no separate style context file — style preferences are embedded in the Planner's long-term memory and referenced in scene plan output.

```json
{
  "style": {
    "colors": ["#1a1a2e", "#16213e", "#e94560"],
    "fonts": { "heading": "Inter Bold", "body": "Inter Regular" },
    "motionFeel": "smooth, confident",
    "pastDecisions": []
  }
}
```

### Who reads/writes

| Agent | Read | Write |
|---|---|---|
| Planner | Yes (owns it) | Yes |
| Editor | Indirectly (from Planner's scene plan output) | No |
| Motion | Indirectly (from Editor's code, which follows the plan) | No |

---

## Agent Ownership Summary

| Concern | Owner |
|---|---|
| User conversation | Planner |
| Clarifying questions | Planner |
| Memory (short + long term) | Planner |
| Scene planning (full design) | Planner |
| Style preferences storage | Planner (working memory) |
| Code writing | Editor |
| Layout and structure | Editor |
| Base styling (Tailwind, colors) | Editor |
| Timing and sequencing | Editor |
| Asset sequencing | Editor |
| Typecheck loop (code phase) | Editor |
| Animation implementation | Motion |
| Transitions between scenes | Motion |
| Text entrance effects | Motion |
| Highlight effects | Motion |
| Typecheck loop (animation phase) | Motion |
| Render check | Motion |

---

## Constraints (MVP)

- 30fps, 20-30 second videos
- Screen recordings + product demos only
- No complex 3D or custom audio (MVP)
- Each scene is a separate component in `src/scenes/`
- `AbsoluteFill` as root container
- `spring()` for animations (not manual `interpolate` unless needed)
- Tailwind classes for styling
- No external API calls in compositions
- No file system access in compositions (they run in the browser via Remotion Player)

---

## File Structure (Sandbox)

```
/workspace/
├── src/
│   ├── Root.tsx              ← <Composition> registry
│   ├── scenes/
│   │   ├── Intro.tsx
│   │   ├── FeatureCallout.tsx
│   │   └── Outro.tsx
│   └── utils/
│       └── animations.ts
├── /.skills/
│   ├── remotion.md
│   ├── remotion-transitions.md
│   ├── remotion-audio.md
│   ├── supabase-storage.md
│   └── tailwind.md
└── package.json
```

---

## Registration

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

Endpoints:

- `POST /chat/planner-agent`
- `POST /chat/editor-agent`
- `POST /chat/motion-agent`

---

## Known Issues

These issues led to the revised split:

1. **Token waste** — Motion agent re-reads and re-edits everything the Editor wrote, just to add animations
2. **Redundant translation** — Editor builds a base, then Motion re-interprets what animations should look like on top of it
3. **Planner overload** — Planner handles both conversation AND full scene planning (structure + timing + creative direction)
4. **No iteration model** — no clear routing for incremental edits after preview (minor tweaks vs creative changes)
5. **Animation is integral to the component** — treating it as a post-processing layer causes unnecessary handoff friction
