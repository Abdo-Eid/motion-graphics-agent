# Editing Agent Project Overview

## Executive Summary

Editing Agent is a web-based creative coding system that turns a user's natural-language request into an editable video project. The user describes the video they want, the system plans the story, designs the scenes, writes Remotion code, verifies that the generated code works, and shows the result in a live preview.

The project is designed for short product videos, product demos, explainer clips, screen-recording videos, and similar marketing or educational assets. Instead of producing a fixed template or a static media file only, the system produces real editable TypeScript and Remotion source code. This means the generated video can be inspected, modified, versioned, and improved over time.

The core idea is a multi-agent workflow:

```text
Planner -> Art Director -> Implementor -> Preview
```

Each agent has a focused responsibility:

- The Planner understands the user's goal and creates a structured brief.
- The Art Director turns that brief into creative scene direction.
- The Implementor converts the approved direction into working Remotion code.
- The Preview shows the current output and supports fast iteration.

For end users, the product should feel like a guided chat-based video editor. For technical stakeholders and builders, the project exposes a clear agentic architecture with explicit orchestration, memory, retrieval, sandboxed execution, and live preview.

## Product Vision

Modern product videos often require a mix of writing, design, animation, frontend development, and video rendering knowledge. Editing Agent is built to combine those disciplines into a guided workflow.

The goal is not only to generate a video once. The goal is to support an iterative creative process where the user can say things like:

- "Make a 20-second launch video for my note-taking app."
- "Make the intro feel more energetic."
- "Use the logo I uploaded."
- "Shorten scene two."
- "Fix the issue in the preview."

The system keeps track of the current project state and routes each request to the right part of the pipeline. A small visual tweak does not need the same process as a complete redesign. A creative direction change should involve design reasoning. A code or typecheck error should go directly to implementation repair.

## What The Product Does

At a high level, Editing Agent helps users create animated videos from prompts and supporting files.

The product supports these primary capabilities:

- Conversational video creation through a chat interface.
- Automatic clarification when the user request is missing important information.
- Structured planning of audience, tone, duration, assets, and key messages.
- Scene-by-scene creative direction before implementation begins.
- Generation of editable Remotion components and compositions.
- Live preview of the current generated video.
- Inspection of generated files for transparency, review, and handoff.
- Iterative editing through follow-up prompts.
- Sandboxed code execution and verification for safer generation.

The intended MVP focuses on short product and screen-recording videos. It avoids broader video-production problems such as complex 3D, advanced audio pipelines, or long-form editing.

## Product Users

Editing Agent is primarily designed for non-technical or semi-technical people who need to create product videos without learning animation code, video tooling, or Remotion.

The end user should be able to describe the desired video, provide brand materials or content, review the generated preview, and request changes in natural language. They should not need to understand the internal agent architecture, source files, sandbox, or verification process to get value from the product.

Typical product users include:

- Startup founders creating launch videos.
- Product marketers creating feature demos.
- Designers exploring motion concepts.
- Educators or technical writers producing short explainer videos.

## Technical Stakeholders And Builders

Although the product is aimed at non-technical users, technical people are an important audience for this overview because they will evaluate, build, maintain, or extend the system.

For technical stakeholders, the important point is that Editing Agent is not a black-box video generator. It is a structured system that produces editable source code, separates planning from design and implementation, runs code generation inside a sandbox, and keeps project state explicit.

Technical readers should use this document to understand:

- How the user-facing workflow maps to backend agents.
- Where planning, creative direction, implementation, verification, and preview happen.
- Which components own which responsibilities.
- How the system can be extended without collapsing all behavior into one agent.

## Architecture Overview

Editing Agent is organized as a monorepo with three major runtime areas:

- Frontend web application.
- Backend agent server.
- Local sandbox for code execution and verification.

The architecture separates user experience, agent reasoning, and code execution into different layers. This keeps responsibilities clear and reduces risk.

```
                              ┌─────────────────────────────────────────────┐
                              │                   User                      │
                              └───────────────────────┬─────────────────────┘
                                                      │ prompt / files
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Frontend Web App                                   │
│    ┌────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌───────────┐  │
│    │    Chat    │   │ Live Preview │   │ Agent Activity  │   │   Files   │  │
│   └ ────────────┘   └──────────────┘   └─────────────────┘   └───────────┘  │
└───────────────────────────────────────────┬─────────────────────────────────┘
                                            │ stream / status
                                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Backend Agent Server                                │
│   ┌─────────┐      ┌──────────────┐      ┌─────────────┐                   │
│   │ Planner │────▶│ Art Director │─────▶│ Implementor │                   │
│   └─────────┘      └──────────────┘      └─────────────┘                   │
│   ┌──────────────────────┐   ┌───────────────────────────┐                 │
│   │    Orchestration     │   │    Memory + Retrieval     │                 │
│   └──────────────────────┘   └───────────────────────────┘                 │
└──────────────────────────────────────────┬─────────────────────────────────┘
                                           │ file / verify tools
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Local Sandbox                                    │
│   ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│   │  Files   │   │    Skills    │   │  Typecheck   │   │   Remotion     │  │
│   │  (R/W)   │   │  (on-demand) │   │   / Render   │   │   Workspace    │  │
│   └──────────┘   └──────────────┘   └──────────────┘   └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

The frontend never calls the language model directly. It streams messages and status updates from the backend. The backend owns the agent workflow, routing, memory, and model calls. The sandbox is the controlled environment where generated code is read, written, and verified.

## System Design Principles

The system is designed around several important principles.

### Separation Of Responsibilities

The Planner, Art Director, and Implementor are intentionally separate. Each one performs a different kind of work.

The Planner handles conversation and decision-making. It should not write code.

The Art Director handles creative design. It should not write code or use execution tools.

The Implementor handles code generation and verification. It should follow the approved design instead of inventing a new creative direction.

This separation makes the system easier to debug, easier to improve, and less likely to mix planning, design, and implementation in a single uncontrolled response.

### Editable Output

The system generates Remotion source code rather than only returning a rendered media file. This gives the project team access to the underlying video implementation. The output can be reviewed, changed, checked into version control, or reused in other workflows.

### Sandboxed Execution

Generated code is handled inside a local sandbox. The sandbox exposes a limited set of tools for reading files, editing files, loading skills, and running verification checks. This creates a boundary between agent reasoning and code execution.

Only the Implementor should use sandbox tools. The Planner and Art Director remain reasoning agents and do not get direct file-editing access.

### Memory And Retrieval Are Separate

The system separates active working state from stored project knowledge.

Memory answers: "What is the current state of this video project?"

Retrieval answers: "What do we know from uploaded files, assets, data, and generated artifacts?"

This distinction prevents the working state from becoming overloaded with raw source data while still allowing agents to use relevant facts when needed.

### Iterative Routing

Not every user request should run the full pipeline. The Planner classifies follow-up requests and chooses the right route.

For example, "make the title bigger" can go directly to the Implementor. "Make the intro feel more premium" should involve the Art Director because it changes creative direction. "Add a pricing scene" requires a broader scene-structure update.

## Major Components

### Frontend Web Application

The frontend is the user's workspace. It provides the interface for creating, reviewing, and iterating on videos.

The main frontend areas are:

- Chat panel for prompts, clarifying questions, and agent responses.
- Live preview area for the generated Remotion composition.
- Agent activity panel for showing what the system is doing.
- File viewer for inspecting generated source code.

The frontend's job is presentation and interaction. It does not own model calls or agent logic. It sends user messages to the backend and displays streamed results, progress, preview updates, and generated files.

### Backend Agent Server

The backend is the intelligence and orchestration layer. It receives chat requests, runs the appropriate agent workflow, manages shared state, and communicates progress back to the frontend.

The backend is responsible for:

- Registering and exposing agents.
- Streaming chat responses.
- Running the Planner, Art Director, and Implementor in the correct order.
- Classifying follow-up requests.
- Managing shared project memory.
- Consulting retrieval when project knowledge is needed.
- Connecting the Implementor to sandbox tools.

### Planner Agent

The Planner is the entry point for user intent.

Its responsibilities include:

- Receiving the user's request.
- Asking clarifying questions when important details are missing.
- Producing a structured brief.
- Capturing project goal, audience, tone, duration, assets, messages, and preferences.
- Initializing shared working memory.
- Classifying follow-up requests.
- Routing work to the Art Director or Implementor.

The Planner owns the conversation strategy. It decides whether the system has enough information to continue or whether it should ask one focused clarification question first.

### Art Director Agent

The Art Director is the creative design layer.

Its responsibilities include:

- Reading the Planner's brief.
- Turning the brief into scene-by-scene creative direction.
- Defining composition, visual hierarchy, pacing, motion feel, transitions, and acceptance criteria.
- Maintaining style consistency across scenes.
- Updating the shared style context.
- Writing scene design records into the shared scene registry.

The Art Director should describe the intended experience in design language, not implementation language. For example, it should say "a confident fade-up with subtle scale" rather than telling the Implementor which specific animation API to use.

### Implementor Agent

The Implementor is the execution layer.

Its responsibilities include:

- Reading scene designs and style context.
- Inspecting the current project files in the sandbox.
- Loading relevant skills only when needed.
- Writing Remotion components, styling, animations, and transitions.
- Running typecheck and optional render checks.
- Fixing errors until the generated code is valid.
- Updating scene status, file paths, and error state.

The Implementor is the only agent that should use file-editing and verification tools. It is expected to follow the Art Director's design faithfully while using engineering judgment to fill small implementation gaps.

### Orchestration Layer

The orchestration layer is the glue that turns separate agents into a product workflow.

It controls:

- Agent ordering.
- Follow-up routing.
- Memory handoff.
- Error handling.
- Eligibility for future parallelism.
- Progress events for the frontend.

For the MVP, the pipeline runs sequentially. The architecture still leaves room for future parallel scene implementation after scene designs are finalized.

### Memory

Memory stores the active working state of the current project.

Important memory structures include:

- Brief: the structured understanding of the user's video request.
- Style context: the current visual language, including palette, typography, mood, animation feel, and transition style.
- Scene registry: the list of scenes, their design data, build status, generated file path, and current error state.
- Routing decision: the Planner's classification of the latest user request.

Memory is mutable. It changes as the project evolves.

### Retrieval

Retrieval stores and finds project knowledge from user-provided or system-generated sources.

Examples include:

- Uploaded briefs or documents.
- Brand guidelines.
- Asset metadata.
- Parsed CSV data or analysis results.
- Previous scene designs.
- Generated files.
- Verification errors and fixes.

Retrieval is used when an agent needs facts from source material. Memory is used when an agent needs the current project state.

### Sandbox

The sandbox is the execution boundary for generated code.

It is expected to provide tool groups for:

- Reading files.
- Listing and searching files.
- Creating and editing files.
- Loading implementation skills.
- Running typecheck checks.
- Running render checks.

The sandbox allows the system to verify generated code before presenting it as complete. It also protects the rest of the application from direct uncontrolled file operations.

### Skills

Skills are focused implementation guides that can be loaded when relevant. They are not all preloaded into every request.

For example, if a video requires kinetic typography, the Implementor can search for and load a kinetic-text skill. If the video requires a chart animation, it can load a chart-related skill.

This staged loading approach keeps the agent context smaller and more relevant.

## How Components Interact

The interaction model is built around a clear handoff sequence.

```
  User
   │ prompt
   ▼
┌─────────┐  brief   ┌──────────────┐  scene designs  ┌─────────────┐
│ Planner │─────────▶│ Art Director │────────────────▶│ Implementor │
│         │          └──────────────┘                 │             │
│ routing │               │ style context              │  sandbox    │
│decision │               ▼                            │  tools      │
└─────────┘        ┌──────────────┐                   └──────┬──────┘
                   │Scene Registry│◀──── build status ───────┘
                   └──────────────┘           │
                                              │ progress events
                                              ▼
                                        ┌──────────┐
                                        │ Frontend │
                                        │ Preview  │
                                        └──────────┘
```

The key handoff objects are the brief, style context, and scene registry.

The brief flows from Planner to Art Director.

The style context flows from Art Director to Implementor and is updated when creative direction changes.

The scene registry is shared across the design and implementation phases. The Art Director writes design fields. The Implementor writes build status, file paths, and errors.

## Product Flow

### Initial Video Generation

The first project flow is the full pipeline.

```
┌──────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│ User │────▶│ Planner │────▶│ Art Director │────▶│ Implementor │────▶│ Preview │
└──────┘     └────┬────┘     └──────────────┘     └──────┬──────┘     └─────────┘
                  │ (if info missing)                     │
                  ▼                                       ▼
           Clarifying Q                             Sandbox verify
```

Step 1: The user describes the video they want.

Example:

```text
Create a 20-second product demo for a note-taking app. It should feel clean, fast, and trustworthy. Show capture, organize, and share features.
```

Step 2: The Planner checks whether the request contains enough information.

If information is missing, the Planner asks a clarifying question. If enough information exists, it creates a structured brief.

Step 3: The Art Director converts the brief into scene direction.

It may define an intro scene, a feature demonstration scene, a collaboration scene, and a closing call-to-action scene. It also establishes the visual style and motion language.

Step 4: The Implementor writes the Remotion code.

It creates or edits scene components, applies layout and styling, adds animations, and wires the composition together.

Step 5: The sandbox verifies the result.

The system runs checks such as typechecking and optionally render validation. If errors occur, the Implementor fixes them.

Step 6: The frontend updates the preview.

The user can watch the generated video, inspect the files, and request changes.

### Follow-Up Editing

Follow-up edits are routed based on intent.

```text
Exact tweak -> Planner -> Implementor -> Preview
Creative change -> Planner -> Art Director -> Implementor -> Preview
Structural change -> Planner -> Art Director -> Implementor -> Preview
Error fix -> Planner -> Implementor -> Preview
```

Examples:

| User Request | Classification | Route |
|---|---|---|
| "Make the title bigger." | Exact tweak | Planner -> Implementor |
| "Make the intro more energetic." | Creative change | Planner -> Art Director -> Implementor |
| "Add a pricing scene." | Structural change | Planner -> Art Director -> Implementor |
| "Fix the typecheck error." | Error fix | Planner -> Implementor |

This routing model keeps small changes fast while preserving creative quality for larger design changes.

## Data And State Flow

The system's state model can be understood as two connected layers.

```
┌──────────────────────────────────────────────────────────────┐
│                       Retrieval Layer                        │
│    uploaded docs · brand assets · parsed data ·              │
│    generated artifacts · historical project facts            │
└────────────────────────────┬─────────────────────────────────┘
                             │  relevant facts (on demand)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       Working Memory                         │
│    brief · style context · scene registry ·                  │
│    routing decision · current errors                         │
└──────────────────────────────────────────────────────────────┘
```

Retrieval provides facts. Memory stores the current working state.

For example, if a user uploads a brand guide, retrieval can find the brand colors and tone. The Planner and Art Director use those facts to update the brief and style context. The Implementor then reads the style context and applies those decisions in code.

## Error Handling And Recovery

The system is designed to detect and repair implementation issues.

Common errors include:

- TypeScript type errors.
- Missing imports.
- Invalid component references.
- Broken scene paths.
- Render-time issues.
- Mismatches between generated files and preview expectations.

When an error occurs, the Implementor updates the scene registry with the error state, inspects the relevant files, applies a fix, and reruns verification. The frontend can show the user where the pipeline is and whether the system is fixing an issue.

For product usability, this is important because users should not have to understand TypeScript errors to continue editing a video.

## Security And Safety Boundaries

The most important boundary is between reasoning and execution.

The Planner and Art Director do not receive direct file-editing tools. They produce structured intent and design direction.

The Implementor receives execution tools, but only through the sandbox. This makes generated code operations more controlled and observable.

Additional safety rules include:

- User uploads should be treated as read-only source inputs.
- Generated outputs should be written to working or output locations, not back into upload sources.
- Browser-executed Remotion compositions should not make external API calls.
- Browser-executed compositions should not access the filesystem.
- Verification should run before marking generated code as complete.

## Technical Stack

The project uses a modern TypeScript-based stack.

| Layer | Technology |
|---|---|
| Frontend | Vite and React |
| Styling | Tailwind CSS |
| Video rendering and preview | Remotion |
| Streaming chat UI | AI SDK React utilities |
| Agent framework | Mastra |
| Memory | Mastra memory and LibSQL concepts |
| Execution boundary | Local Docker sandbox |
| Tool protocol | MCP-style tools |
| Package management | Bun workspaces |

This stack supports a local development workflow where the frontend, backend, and sandbox can run as separate cooperating services.

## Current Implementation Status

The project is currently structured as an early-stage scaffold with detailed architecture and implementation planning. The intended system design is clear: a frontend workspace, a Mastra-based agent backend, and a Docker/MCP sandbox for code execution.

The documentation describes the target workflow and phase-by-phase implementation path. The next major implementation work is to complete the production agent pipeline, connect memory and routing, build the sandbox tools, and wire the preview sync path end to end.

## User Story 1: Founder Creates A Launch Video

### Scenario

A startup founder wants to create a short launch video for a new note-taking app. They do not know Remotion or animation code, but they know the product message.

### User Goal

Create a polished 20-second product video that introduces the app, highlights three core features, and ends with a call to action.

### Flow

1. The founder opens the app and types: "Create a 20-second launch video for a note-taking app. The audience is startup founders. It should feel clean, fast, and trustworthy. Show capture, organize with AI tags, and share with the team."
2. The Planner extracts the goal, audience, tone, duration, and key messages.
3. The Planner decides the request is complete enough and creates a structured brief.
4. The Art Director designs a four-scene structure: intro, capture feature, organization feature, collaboration and call to action.
5. The Art Director defines a clean visual style, restrained motion, readable hierarchy, and smooth transitions.
6. The Implementor generates Remotion code for the scenes and composition.
7. The sandbox verifies that the code typechecks.
8. The frontend displays the live preview and generated files.
9. The founder watches the preview and says: "Make the title bigger and shorten the intro."
10. The Planner classifies the title change as an exact tweak and the timing change as an implementation-level adjustment.
11. The Implementor updates the code directly and the preview refreshes.

### Value

The founder gets a usable, editable launch video without hiring a motion designer or writing animation code. The generated output remains inspectable and modifiable if a developer later wants to refine it.

## User Story 2: Product Marketer Uses Brand Assets And Data

### Scenario

A product marketer wants to create a short feature video based on a brand guide, a logo, and a small CSV export showing customer productivity improvements.

### User Goal

Create a data-supported promotional video that matches the company's visual identity and highlights a measurable product benefit.

### Flow

1. The marketer uploads a brand guide, a logo, and a CSV file with customer productivity metrics.
2. The system routes each input through the correct knowledge path: the brand guide is summarized and indexed, the logo is treated as an asset, and the CSV is parsed for structured analysis.
3. The marketer types: "Make a 30-second video showing that teams save time after using our product. Use our brand style and include the logo at the end."
4. The Planner retrieves relevant facts from the brand guide and data analysis, then creates a brief with the target audience, core message, and evidence.
5. The Art Director uses the brand colors, logo metadata, and productivity insight to design a sequence of scenes: problem, metric reveal, product workflow, and branded closing.
6. The Implementor loads relevant skills for chart or metric animation, generates the Remotion scenes, and includes the logo in the final scene.
7. The sandbox runs verification checks.
8. The frontend shows the preview and activity timeline so the marketer can understand how the system used the uploaded materials.
9. The marketer says: "Make the metric reveal feel more dramatic but keep the brand style."
10. The Planner routes the request through the Art Director because it changes creative direction.
11. The Art Director updates the motion direction for the metric scene while preserving the style context.
12. The Implementor updates the animation and verifies the result.

### Value

The marketer gets a brand-aligned, data-informed video without manually translating documents, assets, and analytics into animation code. The system preserves creative consistency while still allowing fast iteration.

## Why This Design Matters

Editing Agent is not just a chatbot that writes code. It is a structured creative production system.

The multi-agent architecture makes the workflow easier to control. The Planner protects the user experience by clarifying and routing. The Art Director protects creative quality by creating explicit design intent. The Implementor protects technical quality by generating and verifying real code in a sandbox.

This design is especially important for video generation because good output requires more than a single response. It requires understanding the user, maintaining a visual direction, implementing precisely, checking the result, and supporting follow-up changes.

## Future Direction

The architecture leaves room for several future improvements:

- Parallel implementation of independent scenes.
- A review loop where the Art Director critiques generated previews.
- More advanced asset handling for screenshots, logos, and screen recordings.
- Export workflows for final video files.
- Improved error recovery UX.
- More specialized skills for typography, charts, product UI animation, and transitions.
- Stronger retrieval over current project artifacts and previous iterations.

The current design gives the project a clear foundation: a user-facing creative workspace, a structured agent pipeline, and a safe implementation environment for generating editable video code.
