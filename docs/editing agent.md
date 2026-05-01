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

### Planner (Supervisor)

- Owns the user conversation end-to-end
- Asks clarifying questions
- Produces a structured brief
- Initializes and owns the project's Workspace State
- Classifies follow-up edits and **dispatches** the next agent directly via subagent tool calls

The Planner is the supervisor. It holds the routing rules in its system prompt and invokes the Art Director and Implementor through delegation tools (`delegateToArtDirector`, `delegateToImplementor`). The Planner does not write code and does not use sandbox tools, but it does control the flow.

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

### Delegation

There is no separate orchestration layer. Dispatch happens inside the Planner via subagent tools:

- `delegateToArtDirector` — invokes the Art Director agent for scene design work
- `delegateToImplementor` — invokes the Implementor agent for a specific scene

These tools are thin wrappers around `mastra.getAgent(...).generate(...)` calls. They:

- Build the right input prompt from current Workspace State
- Stream the subagent's progress as `agent.*` events on the SSE bus
- Return the subagent's textual result to the Planner so it can decide the next step

The Planner can call delegation tools **in parallel** (AI SDK supports parallel tool calls) — useful for running Implementor across multiple independent scenes at once.

Field ownership is still enforced: each subagent only gets the role-correct memory helpers (Art Director cannot call `setBrief`, Implementor cannot call `setStyleContext`, etc.). The role guards in `memory/access.ts` are the load-bearing enforcement layer.

See [`tasks/phase-3-planner-agent.md`](../tasks/phase-3-planner-agent.md) for the full supervisor + delegation-tool spec.

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

Sandbox service (:4311)
  |- Bun process exposing Mastra MCPServer over HTTP
  |- .workspace/ project scaffold
  `- skills/ markdown docs
```

The frontend streams from Mastra with `useChat()`. The backend owns all model calls. Code execution happens inside a local Bun sandbox process through MCP tools (no Docker — see [`local-sandbox-service-design.md`](local-sandbox-service-design.md)).

## Sandbox Model

The sandbox is a separate local Bun process, not Docker, not E2B.

The main app (Mastra) connects to the sandbox's MCP server over HTTP and exposes the discovered tools to the Implementor only. The frontend reads workspace files through Mastra read-through routes.

Expected tool families:

- Read: `read_file`, `list_files`, `grep`
- Write: `edit_file`, `create_file`
- Skills: `list_skills`, `load_skill`
- Verification: `run_typecheck`, `run_render_check`
- Execution: `exec_command`, `exec_background`, `check_background`, `kill_background`

`run_typecheck` and `run_render_check` are convenience wrappers that use `exec_command` internally. The agent sees them as named tools for clarity.

## Project State: Two Layers

The project uses two project-scoped state layers. There is **no cross-session or user-level memory** in the MVP.

1. **Conversation Context** — the chat thread for this session (Mastra thread memory, no custom summarizer).
2. **Workspace State** — the structured, mutable state of the project. Agents read and write fields: `brief`, `styleContext`, `sceneRegistry`, and `assets`.

### How they work together

1. **Workspace State is the default source of truth.** Agents read it directly. It holds the active project state: the brief, style decisions, scene tracking, and asset references.
2. **Workspace files are generated outputs.** Code lives in `scenes/*.tsx`. Derived facts (e.g., data analysis results) live in `notes/` as markdown files. Agents read these with normal sandbox file tools.
3. **The Knowledge Store is for large uploaded docs only.** When a large PDF or document is uploaded, it is chunked and indexed. Planner and Art Director can retrieve from it when needed. It is not the default — agents read from Workspace State first.
4. **Conversation Context flows into every turn.** Recent chat history is included alongside Workspace State in each agent run.

### Rule of thumb

| Need | Where to look |
|---|---|
| Recent user/agent messages | Conversation Context |
| Current brief, style, scene status, assets | Workspace State |
| Derived facts (CSV analysis, extracted doc text) | Workspace files (`notes/`) — read directly |
| A specific detail from a large uploaded doc | Knowledge Store via retrieval tool |
| Implementation patterns, API reference | Knowledge Store (Remotion API, skills library indexed at startup) |

See [`project-knowledge-and-skills.md`](project-knowledge-and-skills.md) for upload pipelines and [`pdf-upload-walkthrough.md`](pdf-upload-walkthrough.md) plus [`upload-walkthroughs.md`](upload-walkthroughs.md) for end-to-end traces.

---

## Workspace State Structures

Workspace State is project-scoped and consists of four core structures.

### `brief`

Owned exclusively by the Planner.

Stores:

- project goal
- audience
- tone
- duration (in seconds)
- key messages
- user preferences (colors, animation feel, etc.)

Once written, the brief is read by the Art Director and Implementor. It is the north star for the entire project.

### `styleContext`

Owned exclusively by the Art Director.

Stores:

- color palette
- typography decisions
- transition style
- animation feel
- mood keywords

This value is overwritten in place so it always reflects the current creative direction. It is read by the Implementor to ensure consistency across scenes.

### `sceneRegistry`

Shared scene tracking record, split ownership by role.

Stores per scene:

- scene number and name
- current design data (Art Director writes)
- build status (Implementor writes)
- generated file path (Implementor writes)
- current error state (Implementor writes)

Typical status flow:

```text
pending -> designed -> building -> built -> error
```

### `assets`

List of uploaded asset references.

Stores per asset:

- id (unique identifier)
- path (relative to `uploads/` folder)
- description (written at upload time by VLM or multimodal model)

Assets are written by the upload pipeline and read by all agents. No agent modifies this list — uploads and asset classification are handled by the upload router and Planner.

### Ownership

- **Planner**: owns `brief` initialization and writes no other fields
- **Art Director**: writes `styleContext` and `sceneRegistry[n].design`
- **Implementor**: writes `sceneRegistry[n].status`, `.filePath`, and `.errors`
- **Upload pipeline**: writes to `assets[]` at ingest time

### Mutation Rules

| Field | Pattern |
|---|---|
| `styleContext` | overwrite |
| `sceneRegistry[n].status` | overwrite |
| `sceneRegistry[n].errors` | overwrite |
| message history and user profile | append |

### Output Shapes

**Brief example** (Planner writes):

```ts
{
  goal: "30-second product demo for a note-taking app",
  audience: "Product managers and startup founders",
  tone: "Clean, professional, confident",
  duration: 30,  // seconds
  keyMessages: [
    "Capture notes instantly",
    "Organize with AI tags",
    "Share with your team"
  ],
  userPreferences: {
    motionFeel: "smooth, confident",
    colorPalette: "#1a1a2e, #16213e, #e94560"
  }
}
```

**StyleContext example** (Art Director writes):

```ts
{
  palette: ["#1a1a2e", "#16213e", "#e94560"],
  fonts: ["Inter", "Playfair Display"],
  mood: "confident, minimal",
  animationFeel: "smooth spring, no bounce",
  transitions: "fade or slide, 0.3s duration"
}
```

**Scene Registry entry** (Art Director + Implementor collaborate):

```ts
{
  number: 1,
  name: "Intro",
  design: {
    duration: "5 seconds",
    purpose: "Hook the viewer with the product name and a bold visual",
    composition: "Centered product name, large and bold",
    animation: "Title fades in smoothly with a slight upward drift"
  },
  status: "built",  // Implementor writes
  filePath: "scenes/01-intro.tsx",  // Implementor writes
  errors: []  // Implementor writes
}
```

**Asset example** (Upload pipeline writes):

```ts
{
  id: "logo-dark-1",
  path: "uploads/logo-dark.png",
  description: "Primary brand logo, dark variant, transparent background, geometric sans style"
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
| Workspace state | `@mastra/memory` (thread memory) + simple TypeScript types |
| State persistence | LibSQL (optional for now, Mastra memory handles MVP) |
| Knowledge store | LibSQL vector extension (large docs + skills library + API reference) |
| Sandbox | Local Bun process + MCP/HTTP |
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

- Build the local Bun sandbox service
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
- [`local-sandbox-service-design.md`](local-sandbox-service-design.md): sandbox service design
