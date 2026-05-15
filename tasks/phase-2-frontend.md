# Phase 2 — Frontend Task

## What You're Building

A full-viewport web UI for the current Motion Graphics Agent workflow:

```text
Planner -> Art Director -> Implementor
```

The app runs at `http://localhost:3000` and streams chat from the Mastra server at `http://localhost:4111/chat/planner-agent`.

The UI should still render sensibly if the backend is offline.

## Layout

```text
| Chat | Preview | Activity |
|      bottom file viewer     |
```

- **Left**: chat interface for user prompts, clarifications, and streamed replies from the Planner
- **Center**: Remotion preview panel
- **Right**: agent activity panel showing Planner intake/routing, Art Director design work, and Implementor execution progress
- **Bottom**: generated file tree and read-only code viewer

All panels should be resizable. The shell should fill the viewport, with internal scrolling per panel.

## Design Direction

- dark by default
- dense, tool-like layout
- minimal chrome
- subtle borders, restrained surfaces
- monospace for logs and code
- clear small status indicators for idle, active, and error states

## Tech Stack

| What      | Package                        |
| --------- | ------------------------------ |
| Framework | Vite + React                   |
| Styling   | `tailwindcss` v4               |
| Chat      | `@ai-sdk/react`                |
| Preview   | `remotion`, `@remotion/player` |
| Data      | `@tanstack/react-query`        |

## Chat Integration

Use `useChat()` against the Planner endpoint:

```tsx
import { useChat } from "@ai-sdk/react";

const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "http://localhost:4111/chat/planner-agent",
});
```

The activity panel should be designed around the current role split:

- Planner: clarification, briefing, routing
- Art Director: scene design and style updates
- Implementor: code generation, typecheck, fixes

## Preview

Use a placeholder Remotion composition for now. The real compositions will be synced from workspace output later.

## Files To Create Or Modify

- `web/src/routes/__root.tsx`
- `web/src/routes/index.tsx`
- `web/src/components/chat-panel.tsx`
- `web/src/components/player-panel.tsx`
- `web/src/components/agent-log-panel.tsx`
- `web/src/components/file-tree-panel.tsx`
- `web/preview/Composition.tsx`

## Checkpoint

Run:

```bash
bun run dev:web
```

Then verify:

- `http://localhost:3000` renders the full panel layout
- the chat input works even if the backend is unavailable
- the preview shows the placeholder composition
- the activity panel reflects the Planner / Art Director / Implementor model
