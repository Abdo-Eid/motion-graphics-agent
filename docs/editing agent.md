# Editing Agent

> One-line summary: a multi-agent system that turns user prompts into editable Remotion code through a live Planner -> Art Director -> Implementor workflow.

## Concept

This project is a web-based creative coding system for short product videos.

Instead of filling in templates or returning JSON, the system produces real TypeScript and Remotion code. The user works through chat, the backend agents coordinate the creative and implementation steps, and the frontend shows a live preview of the current composition.

## Current Architecture

The active architecture is:

```text
Planner -> Art Director -> Implementor
```

### Planner

- Owns the user conversation
- Asks clarifying questions
- Produces a structured brief
- Initializes and owns the project's Workspace State
- Classifies follow-up edits and **decides** the route

The Planner does not write code and does not use sandbox tools. It is the decision-maker, not the executor — it outputs a routing decision but does not invoke the next agent itself. The orchestration layer (see below) executes the route.

### Art Director

- Receives the Planner brief
- Designs scenes one by one
- Defines composition, hierarchy, pacing, animation feel, and transition direction
- Maintains shared `styleContext`
- Writes scene design data into shared `sceneRegistry`

The Art Director is design-only. It does not write code and does not use sandbox tools.

### Implementor

- Receives scene design output from the Art Director
- Reads project files and skill docs from the sandbox
- Writes Remotion code, styling, animation, and transitions in one pass
- Runs typecheck and optional render checks
- Updates build status and file paths in shared `sceneRegistry`

The Implementor is the only execution agent and the only one that should use MCP tools.

### Orchestration

The orchestration layer is **not an agent**. It is the runtime glue that takes the Planner's routing decision and executes the pipeline reliably.

It controls:

- Calling the next agent based on the Planner's routing decision
- Sequencing handoffs (brief → scene designs → code)
- Enforcing field ownership in Workspace State
- Error handling and retries
- Streaming progress events to the frontend
- Future parallelism (e.g. parallel scene implementation once designs are finalized)

#### Planner vs Orchestration

| Concern | Planner | Orchestration |
|---|---|---|
| Understands user intent | yes | no |
| Decides which agent runs next | yes | no |
| Actually invokes the next agent | no | yes |
| Manages handoffs and field ownership | no | yes |
| Handles sequencing, errors, retries | no | yes |

The Planner is the brain of the routing decision. The orchestration layer is the runtime that carries it out. This split keeps LLM-suited reasoning separate from code-suited control flow.

See [`tasks/phase-3-orchestration.md`](../tasks/phase-3-orchestration.md) for the full orchestration spec.

## Flow

### Initial generation

```text
User -> Planner -> Art Director -> Implementor -> Preview
```

1. The user describes the target video.
2. The Planner clarifies missing constraints and creates a brief.
3. The Art Director turns the brief into scene-by-scene direction.
4. The Implementor writes and validates the Remotion code.
5. The frontend syncs the current files and reloads the preview.

### Incremental edits

The Planner can avoid the full pipeline for narrow changes.

- Exact tweak: route directly to Implementor
- Creative change: route to Art Director, then Implementor
- Structural change: run the full pipeline

Typical routing examples:

| User request | Classification | Route |
|---|---|---|
| "Make the title bigger" | Minor tweak | Planner -> Implementor |
| "Change the intro animation to feel more energetic" | Creative change | Planner -> Art Director -> Implementor |
| "Add a new scene about pricing" | Major restructure | Planner -> Art Director -> Implementor |
| "Use blue instead of red" | Style change | Planner -> Art Director -> Implementor |

Routing rule of thumb:

- direct Implementor path only for exact, unambiguous changes
- Art Director path for feel, layout, style, pacing, or ambiguous creative direction
- if classification is unclear, the Planner should ask one clarifying question before routing

## System Architecture

```text
Vite + React frontend (:3000)
  |- chat UI
  |- Remotion preview
  |- agent activity panel
  `- file viewer

Mastra server (:4111)
  |- planner-agent
  |- art-director-agent
  |- implementor-agent
  `- memory and routing

Docker sandbox (:3001)
  |- MCP server
  |- /workspace project scaffold
  `- /.skills markdown docs
```

The frontend streams from Mastra with `useChat()`. The backend owns all model calls. Code execution happens inside a local Docker sandbox through MCP tools.

## Sandbox Model

The sandbox is local Docker, not E2B.

The host starts a container, connects to the MCP server inside it, and exposes those discovered tools to the Implementor. The host also pulls file changes back for preview sync.

Expected tool families:

- Read: `read_file`, `list_files`, `grep`
- Write: `edit_file`, `create_file`
- Skills: `list_skills`, `load_skill`
- Verification: `run_typecheck`, `run_render_check`

## Project State: Three Layers

The project uses three project-scoped state layers. There is **no cross-session or user-level memory** in the MVP.

1. **Conversation Context** — the chat thread for this session, with rolling summarization when it gets long.
2. **Workspace State** — the structured, mutable state of the project. Agents read and write fields like `brief`, `styleContext`, `sceneRegistry`, `assets`, `dataSummaries`, `documentSummaries`, and `routing`.
3. **Project Knowledge Store** — chunked large documents (PDFs, brand guides) with a vector index, queried via a retrieval tool only when needed.

### How they work together

1. **Workspace State is the default source of truth.** Agents read fields directly. Most upload types (small text, asset images, tiny CSVs, derived facts) land in Workspace State and never need retrieval.
2. **The Knowledge Store is queried via tools.** When a large PDF is uploaded, its chunks live in the Knowledge Store and a short summary is mirrored into Workspace State. If an agent needs a specific detail not in the summary, it calls a retrieval tool. The returned chunks are used for that turn and are not duplicated into Workspace State.
3. **Conversation Context flows into every turn.** Recent chat history (or its summary) is included alongside Workspace State in each agent run.

### Rule of thumb

| Need | Where to look |
|---|---|
| Recent user/agent messages | Conversation Context |
| Current brief, style, scene status, assets, data facts | Workspace State |
| A buried detail from a large uploaded doc | Knowledge Store via retrieval tool |
| A skill snippet for implementation | Skill loader (separate from the Knowledge Store) |

See [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md) for upload pipelines and [`pdf-upload-walkthrough.md`](pdf-upload-walkthrough.md) plus [`upload-walkthroughs.md`](upload-walkthroughs.md) for end-to-end traces.

---

## Workspace State Structures

Workspace State is project-scoped and centered on a few core structures.

### `styleContext`

Owned primarily by the Art Director.

Stores:

- color palette
- typography decisions
- transition style
- animation feel
- mood keywords

This value is overwritten in place so it always reflects the current creative direction.

### `sceneRegistry`

Shared scene tracking record.

Stores:

- scene number and name
- current design data
- build status
- generated file path
- current error state

Typical status flow:

```text
not-started -> designed -> building -> built -> error
```

### Ownership

- Planner: owns the brief, routing, and Workspace State initialization
- Art Director: writes `styleContext` and `sceneRegistry[n].design`
- Implementor: writes `sceneRegistry[n].status`, `.filePath`, and `.errors`
- Upload router (orchestration): writes `assets`, `dataSummaries`, and `documentSummaries` at upload time

### Mutation Rules

| Field | Pattern |
|---|---|
| `styleContext` | overwrite |
| `sceneRegistry[n].status` | overwrite |
| `sceneRegistry[n].errors` | overwrite |
| message history and user profile | append |

### Output Shapes

Planner brief example:

```json
{
  "projectGoal": "30-second product demo for a note-taking app",
  "audience": "Product managers and startup founders",
  "tone": "Clean, professional, confident",
  "duration": "20-30 seconds (600-900 frames at 30fps)",
  "assets": [
    { "type": "logo", "path": "/assets/logo.png" }
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

Art Director scene design example:

```json
{
  "sceneNumber": 1,
  "name": "Intro",
  "duration": "150 frames (5 seconds)",
  "purpose": "Hook the viewer with the product name and a bold visual",
  "composition": {
    "layout": "Centered product name, large and bold",
    "hierarchy": "Product name is the hero. Tagline below in smaller weight."
  },
  "animation": {
    "entrance": "Title fades in smoothly with a slight upward drift",
    "exit": "Quick wipe to the right"
  },
  "acceptanceCriteria": [
    "Title is readable within the first 30 frames",
    "Transition into scene 2 is seamless"
  ]
}
```

## Frontend Structure

```text
| Chat | Preview | Activity |
|      bottom file viewer     |
```

- **Chat**: instructions, clarification, streamed responses
- **Preview**: Remotion Player with synced local files
- **Activity**: planner routing, design phase, implementation progress
- **Files**: generated code inspection

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React |
| Preview | Remotion |
| Agent runtime | Mastra |
| Streaming UI | `@ai-sdk/react` |
| Workspace state | `@mastra/memory`, LibSQL |
| Knowledge store | Vector index for large uploaded docs |
| Sandbox | Local Docker + MCP |
| Package manager | Bun |

## Build Phases

### Phase 1

- Scaffold monorepo
- Create `web/`, `mastra/`, and `sandbox/`
- Add shared root scripts and environment configuration

### Phase 2

- Build the frontend shell
- Add chat, preview, activity, and file panels
- Handle planner streaming and offline/error states

### Phase 3

- Implement `planner-agent`
- Implement `art-director-agent`
- Implement `implementor-agent`
- Register all agents with `chatRoute()`

### Phase 4

- Build the local Docker sandbox
- Expose MCP tools and skill loading
- Connect preview file sync

### Phase 5

- Add Workspace State persistence
- Wire the Knowledge Store retrieval tool for large uploaded docs

### Phase 6

- Export pipeline
- Error recovery UX
- polish for iterative editing

## MVP Constraints

- 20-30 second product and screen-recording videos
- 30fps
- no complex 3D
- no custom audio pipeline in MVP
- code output must remain editable Remotion source

Implementation conventions:

- each scene should be a separate component in `src/scenes/`
- use `AbsoluteFill` as the root container
- prefer `spring()` for animation unless another approach is clearly needed
- use Tailwind classes where appropriate
- do not make external API calls from Remotion compositions
- do not access the filesystem from browser-executed compositions

## Future Considerations

- Art Director review loop after preview output exists
- parallel scene generation with Art Director -> Implementor pairs
- dedicated asset handling for screenshots, logos, and screen recordings

## Related Docs

- [`SETUP_GUIDE.md`](SETUP_GUIDE.md): implementation phases and checkpoints
- [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md): project knowledge routing, retrieval, uploads, and skill loading
- [`Building a Local Docker Sandbox for Agentic Apps.md`](Building%20a%20Local%20Docker%20Sandbox%20for%20Agentic%20Apps.md): sandbox design
