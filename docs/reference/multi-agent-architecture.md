# Multi-Agent Architecture — Revised Split

> **Last updated:** 2026-04-21
> **Status:** Architecture decision — replaces the original Planner/Editor/Motion split

---

## Overview

A 3-agent pipeline that mirrors real motion-graphics production:

```
Planner (brief + context) → Art Director (scene design) → Implementor (code)
```

| Agent | id | Memory | Has Tools | Role |
|---|---|---|---|---|
| Planner | `planner-agent` | Private + Shared | No (future) | Intake, clarification, context management, brief generation |
| Art Director | `art-director-agent` | Shared (read/write) | No | Scene-by-scene creative design, style consistency |
| Implementor | `implementor-agent` | Shared (read/write) | Yes (MCP) | Code execution — Remotion, styling, animations, typecheck loop |

---

## Why This Split

### Problems with the old split (Planner / Editor / Motion)

- **Token waste:** Motion agent re-read and re-edited everything the Editor wrote, just to add animations
- **Redundant translation:** Editor built a base, then Motion translated its own interpretation of what animations should look like
- **Planner overload:** Planner was doing both intake/conversation AND full scene planning

### What changed

- **Editor + Motion merged into Implementor** — one agent handles layout, styling, and animation in a single pass
- **Art Director added as the creative brain** — sits between Planner and Implementor, designs scenes without writing code
- **Planner scope reduced** — focuses on conversation, clarification, and context instead of designing scenes

### Scalability

This split scales naturally for parallel scene generation:

```
Planner → brief
  └── Scene 1: Art Director → Implementor
  └── Scene 2: Art Director → Implementor
  └── Scene 3: Art Director → Implementor
```

Each subagent spawn gets the shared style context, so visual consistency holds across parallel scenes.

---

## Agent 1 — Planner (Producer)

### Responsibility

The conversation and context agent. Owns the relationship with the user.

### What it does

- Receives user intent (e.g. "Make a 30-second product demo highlighting these features")
- Asks clarifying questions if the request is vague:
  - Target audience?
  - Tone? (professional, playful, minimal)
  - Assets available?
  - Key messages to highlight?
- Does NOT plan until enough info is gathered
- Produces a **brief** — not a full scene plan, but:
  - Project goal
  - Target audience and tone
  - Available assets (with paths)
  - Key messages / copy points
  - Timing constraints (total duration)
  - Any user-stated preferences
- Manages memory:
  - Private: message history, long-term user profile, semantic recall
  - Shared: owns storage of `styleContext` and `sceneRegistry` — written to by AD and Implementor, persisted here
- **Classifies edit types** for routing incremental user feedback:

| Edit type | Route to |
|---|---|
| Minor tweak (size, color, text change) | Implementor directly |
| Creative change (animation feel, layout rethink) | Art Director → Implementor |
| New scene or major restructure | Full pipeline (Art Director → Implementor) |

### What it does NOT do

- Does NOT design scenes
- Does NOT write code
- Does NOT call sandbox tools
- Does NOT make creative decisions

### Skills

None — the Planner is a conversational agent with no code output.

### Memory

**Private (Planner only):**

| Layer | Scope | What it stores |
|---|---|---|
| Message History | Thread | Recent conversation messages |
| User Profile | Per user | Style preferences, past decisions, cross-session prefs |
| Semantic Recall | Per user | RAG over past conversations for "make it like last time" |

**Shared (resource-scoped, all agents read/write):**

| Field | Primary writer | What it stores |
|---|---|---|
| `styleContext` | Art Director | Colors, fonts, animation feel, transition style, mood — updated in place |
| `sceneRegistry` | AD (design), Implementor (status) | Per-scene: status, design, filePath, errors |

`styleContext` and `sceneRegistry[n].status` are always overwritten with current state — not appended. Message history and user profile are append-only.

### Output format

```json
{
  "projectGoal": "30-second product demo for a note-taking app",
  "audience": "Product managers and startup founders",
  "tone": "Clean, professional, confident",
  "duration": "20-30 seconds (600-900 frames at 30fps)",
  "assets": [
    { "type": "logo", "path": "/assets/logo.png" },
    { "type": "screenshot", "path": "/assets/dashboard.png" }
  ],
  "messages": [
    "Capture notes instantly",
    "Organize with AI tags",
    "Share with your team"
  ],
  "preferences": {
    "motionFeel": "smooth, confident",
    "colorPalette": ["#1a1a2e", "#16213e", "#e94560"]
  }
}
```

---

## Agent 2 — Art Director

### Responsibility

The creative brain. Translates the Planner's brief into scene-by-scene design direction. Owns visual consistency and creative quality.

### What it does

- Receives the brief from the Planner
- Reads `styleContext` from shared memory before designing any scene
- Designs **scene by scene**:
  - Scene purpose and goal
  - Visual composition (layout, hierarchy, element placement)
  - Animation direction — described in **professional motion-graphics language**: timing, weight, easing character, spatial direction. May suggest approximate values as guidance (e.g., "high damping, around 18–22, for a settled feel"), but these are hints not prescriptions:
    - "Confident entrance — element drifts up ~20px and settles with no overshoot. High damping."
    - "Quick, energetic slide-in from the left — short duration, slight overshoot on arrival."
    - "Gentle fade with a subtle scale-up from 95% to 100%. Very slow, no snap."
  - Transitions between scenes (described as feel and direction, not API calls)
  - Style rules (colors, fonts, spacing, mood)
  - Assets needed per scene
  - Acceptance criteria (what "done" looks like for this scene)
- Maintains **style consistency** across all scenes:
  - Reads from and writes to a shared style context (managed via Planner's working memory)
  - Ensures scenes feel like they belong to the same video
- Does NOT write code
- Does NOT reference specific Remotion APIs or parameters

### What it does NOT do

- Does NOT write code
- Does NOT reference specific Remotion APIs (`spring()`, `interpolate()`, etc.)
- Does NOT call sandbox tools
- Does NOT manage memory or conversation

### Skills

None — the Art Director reasons about visuals and feel, not implementation.

### Shared memory access

The Art Director reads `styleContext` before designing and writes back any updates (new decisions, refined feel) after each scene. It also writes its scene design to `sceneRegistry[n].design`.

`styleContext` is overwritten in place — not appended. The current value always reflects the latest state.

```json
// styleContext shape
{
  "colors": { "primary": "#1a1a2e", "accent": "#e94560", "background": "#0f0f1a", "text": "#ffffff" },
  "fonts": { "heading": "Inter Bold", "body": "Inter Regular" },
  "animationFeel": "smooth, confident, no overshoot",
  "transitionStyle": "prefer wipe/slide unless tone is elegant",
  "moodKeywords": ["professional", "clean", "modern"]
}

// sceneRegistry[n].design written by AD
{
  "sceneNumber": 1,
  "name": "Intro",
  "composition": { ... },
  "animation": { ... },
  "transition": { ... },
  "acceptanceCriteria": [ ... ]
}
```

### Output format (per scene)

```json
{
  "sceneNumber": 1,
  "name": "Intro",
  "duration": "150 frames (5 seconds)",
  "purpose": "Hook the viewer with the product name and a bold visual",
  "composition": {
    "layout": "Centered product name, large and bold. Subtle gradient background from dark to accent color.",
    "hierarchy": "Product name is the hero. Tagline below in smaller, lighter weight.",
    "spacing": "Generous padding. Name sits in the upper third. Tagline below center."
  },
  "animation": {
    "entrance": "Title fades in smoothly with a slight upward drift — confident, no bounce",
    "background": "Gradient shifts slowly from left to right",
    "exit": "Quick wipe to the right to transition into scene 2"
  },
  "transition": {
    "to": "Scene 2",
    "style": "Quick horizontal wipe — fast and decisive"
  },
  "style": {
    "backgroundColor": "Dark (#1a1a2e) to accent (#e94560) gradient",
    "titleFont": "Bold, large",
    "titleColor": "White"
  },
  "assets": [],
  "acceptanceCriteria": [
    "Title is clearly readable within first 30 frames",
    "Animation feels smooth, not flashy",
    "Transition into scene 2 is seamless"
  ]
}
```

---

## Agent 3 — Implementor

### Responsibility

The execution agent. Translates the Art Director's scene designs into real Remotion code. Pure implementation — no creative reinterpretation.

### What it does

- Receives scene design from the Art Director
- Loads relevant skill docs before writing:
  - `remotion.md` — core Remotion APIs
  - `remotion-transitions.md` — transitions and animation patterns
  - `tailwind.md` — Tailwind classes available in Remotion
  - `remotion-audio.md` — only if the scene involves audio
- Reads `styleContext` and `sceneRegistry[n].design` from shared memory before writing any code
- Reads the existing project scaffold (helpers, utilities, existing files)
- Writes Remotion `<Composition>` and individual scene `.tsx` files
- Implements layout, styling, animations, and transitions as designed
- Translates animation **feel descriptions** into actual Remotion parameters:
  - "smooth, confident, no overshoot" → `spring({ frame, fps, config: { damping: 18, mass: 1 } })`
  - "quick, energetic slide-in" → `interpolate()` with a custom easing over a short frame range
- Uses the **typecheck feedback loop**:
  - Edit → `run_typecheck()` → read errors → fix → repeat
  - Loops until code is clean
- Uses `edit_file` (search-and-replace) for modifications, `create_file` only for new files
- Never rewrites entire files — surgical edits with 2-3 lines of context

### What it does NOT do

- Does NOT make creative decisions (layout, color, animation style)
- Does NOT deviate from the Art Director's scene design
- Does NOT manage memory or conversation
- Uses AD's professional descriptions and any suggested values as the primary guide — applies implementation judgment only to fill gaps AD left open, never to reinterpret the design

### Skills

| Skill | When loaded | What it provides |
|---|---|---|
| `remotion.md` | Always | `useCurrentFrame`, `spring`, `interpolate`, `AbsoluteFill`, `Sequence`, `useVideoConfig` |
| `remotion-transitions.md` | When transitions are specified | `TransitionSeries`, slide, fade, flip transitions |
| `tailwind.md` | Always | Tailwind classes available in Remotion compositions |
| `remotion-audio.md` | Only for audio scenes | `Audio`, `useAudioData`, `visualizeAudio` |

### Tools

| Tool | How the Implementor uses it |
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

Real Remotion `.tsx` files:

```tsx
// scenes/Intro.tsx
export const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame, fps, config: { damping: 18, mass: 1 } });
  const translateY = interpolate(opacity, [0, 1], [20, 0]);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #1a1a2e, #e94560)",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
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
User → Planner (clarify → brief) → Art Director (design scenes) → Implementor (code) → Preview
```

1. User sends a message
2. Planner asks clarifying questions if needed, then produces a brief
3. Art Director receives the brief, designs scene by scene with style context
4. Implementor receives each scene design, loads skills, writes code, typecheck loop
5. Remotion Player hot-reloads the preview

### Incremental edits (after preview)

The Planner classifies the edit type and routes accordingly:

| User says | Classification | Route |
|---|---|---|
| "Make the title bigger" | Minor tweak | Planner → Implementor directly |
| "Change the intro animation to feel more energetic" | Creative change | Planner → Art Director → Implementor |
| "Add a new scene about pricing" | Major restructure | Planner → Art Director → Implementor (full pipeline) |
| "Use blue instead of red" | Style change | Planner → Art Director (updates style context) → Implementor |

This avoids running the full pipeline for every edit, which would waste tokens on small changes.

#### Routing rules

**Short path (Implementor directly):** Only when the user provides an exact, unambiguous value — a specific number, hex code, or literal text replacement. Examples: `"72px"`, `"#ff0000"`, `"Change 'Get started' to 'Try it free'"`.

**Long path (Art Director → Implementor):** Everything else — any adjective, feel description, layout question, or ambiguous instruction routes through the Art Director by default.

When classification is uncertain, the Planner asks one clarifying question before routing:

> *"Do you mean the animation timing specifically (I can adjust that directly), or the overall energy and feel of the scene (I'll redesign it through the Art Director)?"*

Regardless of which path is taken, the Planner states the route before acting:

> *"Treating this as a minor tweak — updating the font size directly."*
> *"This sounds like a creative change — sending it through the Art Director."*

This lets the user redirect in one message before tokens are spent on the wrong pipeline.

---

## Shared Memory

Resource-scoped (per project). All agents read. Writers are specific per field.

### Fields

**`styleContext`** — overwrite in place, always reflects current state.

```json
{
  "colors": { "primary": "#1a1a2e", "accent": "#e94560", "background": "#0f0f1a", "text": "#ffffff" },
  "fonts": { "heading": "Inter Bold", "body": "Inter Regular" },
  "animationFeel": "smooth, confident, no overshoot",
  "transitionStyle": "prefer wipe/slide unless tone is elegant",
  "moodKeywords": ["professional", "clean", "modern"]
}
```

**`sceneRegistry`** — one entry per scene, updated in place as the pipeline progresses.

```json
[
  {
    "sceneNumber": 1,
    "name": "Intro",
    "status": "built",
    "design": { ... },
    "filePath": "src/scenes/Intro.tsx",
    "errors": []
  }
]
```

`status` values: `not-started → designed → building → built → error`

### Write ownership

| Field | Primary writer |
|---|---|
| `styleContext` | Art Director |
| `sceneRegistry[n].design` | Art Director |
| `sceneRegistry[n].status` / `.filePath` / `.errors` | Implementor |

### Mutation pattern

| Field | Pattern | Why |
|---|---|---|
| `styleContext` | Overwrite | Always reflects current state — no history needed |
| `sceneRegistry[n].status` | Overwrite | State machine — current status only |
| `sceneRegistry[n].errors` | Overwrite | Replace with latest typecheck output |
| Message history / user profile | Append | History — never overwritten |

---

## Agent Ownership Summary

| Concern | Owner |
|---|---|
| User conversation | Planner |
| Clarifying questions | Planner |
| Private memory (history, user profile, RAG) | Planner |
| Shared memory storage | Planner (resource owner) |
| Edit classification and routing | Planner |
| Scene design | Art Director |
| Visual consistency | Art Director |
| Animation feel direction | Art Director |
| `styleContext` writes | Art Director |
| `sceneRegistry[n].design` writes | Art Director |
| Code writing | Implementor |
| Animation implementation | Implementor |
| Typecheck loop | Implementor |
| Skill loading | Implementor |
| `sceneRegistry[n].status / filePath / errors` writes | Implementor |

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
│   └── tailwind.md
└── package.json
```

---

## Future Considerations (Post-MVP)

### Art Director review loop

After the Implementor builds a scene and preview renders, the Art Director can review the code output and send targeted corrections:

```
Art Director (design) → Implementor (build) → [Preview] → Art Director (review) → Implementor (fix if needed)
```

This matches how real art direction works — they review work-in-progress and course-correct.

### Parallel scene generation

Spawn a subagent pair (Art Director → Implementor) for each scene:

```
Planner → brief
  └── Scene 1: Art Director → Implementor
  └── Scene 2: Art Director → Implementor
  └── Scene 3: Art Director → Implementor
```

Each spawn receives the shared style context for consistency.

### Asset management

Dedicated asset handling for screenshots, logos, and screen recordings with automatic path resolution.

---

## Registration

```ts
import { Mastra } from '@mastra/core/mastra'
import { chatRoute } from '@mastra/ai-sdk'
import { plannerAgent } from './agents/planner'
import { artDirectorAgent } from './agents/art-director'
import { implementorAgent } from './agents/implementor'

export const mastra = new Mastra({
  agents: { plannerAgent, artDirectorAgent, implementorAgent },
  server: {
    apiRoutes: [
      chatRoute({ path: '/chat/:agentId' }),
    ],
  },
})
```

Endpoints:

- `POST /chat/planner-agent`
- `POST /chat/art-director-agent`
- `POST /chat/implementor-agent`
