# Phase 2 — Frontend Task

## What You're Building

A single-page web UI for an AI video editing agent. The user chats with an AI planner, agents write Remotion (React) video code in a sandbox, and the UI shows a live-updating video preview alongside an agent activity log and a file viewer.

The app runs at `http://localhost:3000`. It talks to a Mastra agent server at `http://localhost:4111/chat/:agentId` via SSE streaming. The Mastra server may not be running yet while you build — the UI should work standalone regardless.

---

## Layout

```
┌──────────────┬──────────────────────┬─────────────────────┐
│              │                      │                     │
│  Chat Panel  │   Remotion Player    │   Agent Log Panel   │
│  (left)      │   (center)          │   (right)           │
│              │                      │                     │
├──────────────┴──────────────────────┴─────────────────────┤
│              File Tree / Code Viewer (bottom)              │
└───────────────────────────────────────────────────────────┘
```

- **Left (~25%):** Chat interface — message history, text input, send button. Streams responses from the planner agent. User types instructions like "Make a 30-sec product demo" and gets streamed replies.
- **Center (~50%):** Remotion `<Player>` component. Renders a live video preview. For now, embed it with a placeholder composition — the real compositions will come from the sandbox later.
- **Right (~25%):** Agent activity log. Shows which agent is active (Planner / Editor / Motion), what it's doing, and retry/error status. This is read-only; it reads from the chat stream's tool call metadata.
- **Bottom (~30% height):** File tree showing the generated `.tsx` files. Read-only code viewer for now (click a file → see its source). Files will live in `web/preview/` eventually, but for now use a mock file tree.

All panels should be resizable (drag to resize). The layout should fill the full viewport with no scrolling on the outer level — each panel scrolls internally.

---

## Design Direction

- Dark theme by default (this is a dev/creative tool)
- Minimal, dense UI — think IDE, not consumer app
- Use shadcn components as the base: `ResizablePanelGroup`, `ScrollArea`, `Card`, `Button`, `Input`
- Monospace font for code and log areas, sans-serif for chat
- Subtle borders between panels, no heavy shadows
- Status indicators: colored dots or small badges for agent state (idle = gray, active = green, error = red)

---

## Tech Stack (already installed)

| What | Package | Notes |
|---|---|---|
| Framework | `@tanstack/react-start` | File-based routing in `src/routes/` |
| Styling | `tailwindcss` v4 + `shadcn` | `cn()` utility in `src/lib/utils.ts` |
| Chat hook | `@ai-sdk/react` | `useChat()` for SSE streaming |
| Video preview | `remotion` + `@remotion/player` | `<Player>` component |
| Data fetching | `@tanstack/react-query` | Already integrated with query devtools |

### What's already scaffolded

- TanStack Start project with shadcn and tanstack-query add-ons
- `cn()` utility, Tailwind v4, theme toggle
- Header/Footer components (replace or remove — the app should be full-viewport)
- Route structure: `__root.tsx`, `index.tsx`, `about.tsx`
- No shadcn UI components installed yet — you'll need to add the ones you use via `bunx shadcn@latest add <component>` from `web/`

### Important: no shadcn UI directory yet

The `web/src/components/ui/` directory doesn't exist. You need to install the shadcn components you want. From inside `web/`:

```powershell
cd web
bunx shadcn@latest add resizable
bunx shadcn@latest add scroll-area
bunx shadcn@latest add button
bunx shadcn@latest add input
bunx shadcn@latest add card
# etc.
```

---

## Chat Integration

Use `useChat()` from `@ai-sdk/react`:

```tsx
import { useChat } from '@ai-sdk/react'

const { messages, input, handleInputChange, handleSubmit, status } = useChat({
  api: 'http://localhost:4111/chat/planner-agent',
})
```

- `messages` is an array of `{ role, content, toolInvocations }` objects
- `status` can be `'submitted' | 'streaming' | 'ready' | 'error'`
- Tool invocations in messages contain agent activity data (which tool was called, args, result) — surface these in the agent log panel
- The Mastra server won't be running while you build, so handle connection errors gracefully (show "connecting..." or similar)

---

## Remotion Player

Embed the player with a placeholder composition for now:

```tsx
import { Player } from '@remotion/player'
import { Composition } from '../preview/Composition' // placeholder

<Player
  component={Composition}
  inputProps={{}}
  durationInFrames={150}
  compositionWidth={1920}
  compositionHeight={1080}
  fps={30}
  style={{ width: '100%' }}
/>
```

Create a simple placeholder composition in `web/preview/` — just renders "No composition loaded" or a static frame. The real compositions will be synced from the sandbox later.

---

## Files to Create/Modify

- `web/src/routes/__root.tsx` — Remove Header/Footer, make it a bare full-viewport shell
- `web/src/routes/index.tsx` — Replace with the main 3-panel + bottom panel layout
- `web/src/components/chat-panel.tsx` — Chat UI with `useChat()`
- `web/src/components/player-panel.tsx` — Remotion Player wrapper
- `web/src/components/agent-log-panel.tsx` — Agent activity display
- `web/src/components/file-tree-panel.tsx` — File tree + code viewer
- `web/preview/Composition.tsx` — Placeholder Remotion composition

---

## Checkpoint

`cd web && bun run dev` → `http://localhost:3000` renders the full layout with all four panels, no errors. Chat input is functional (will show connection error to Mastra, that's fine). Player shows the placeholder composition.
