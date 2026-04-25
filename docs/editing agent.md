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
- Stores private memory and shared project context
- Classifies follow-up edits and routes them

The Planner does not write code and does not use sandbox tools.

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

## RAG vs Memory

This project separates knowledge into two complementary systems:

- **RAG** — retrieval over stored project knowledge (uploaded files, extracted facts, parsed data, asset metadata, current-project artifacts). Answers "what do we know from the files/data?"
- **Memory** — active working state that agents carry and update during the session (Planner brief, `styleContext`, `sceneRegistry`, errors, routing decisions). Answers "what is the current state of this project right now?"

### How they work together

1. **RAG feeds facts into Memory.** The Planner retrieves relevant facts from uploaded docs, parsed CSV results, or asset metadata and synthesizes them into the brief and `styleContext`.
2. **Memory stores the active working state.** Agents read and write memory structures as the session progresses. Memory does not duplicate raw source data — it holds the *current* derived state.
3. **RAG is re-queryable; Memory is mutable.** RAG indexes are queried on demand. Memory structures are overwritten in place as the project evolves.

### Rule of thumb

| Need | System |
|---|---|
| Look up something from uploaded files or data | RAG |
| Check or update the current project state | Memory |
| Find an asset's metadata or a doc excerpt | RAG |
| See which scenes have errors or what the current style is | Memory |

See [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md) for full RAG pipeline details.

---

## Memory Structures

Memory is resource-scoped and centered on two core structures.

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

- Planner: private memory, routing, shared-memory storage owner
- Art Director: writes `styleContext` and `sceneRegistry[n].design`
- Implementor: writes `sceneRegistry[n].status`, `.filePath`, and `.errors`

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
| Memory | `@mastra/memory`, LibSQL |
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

- Add shared-memory persistence and retrieval
- Index past work and conversations for recall

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
