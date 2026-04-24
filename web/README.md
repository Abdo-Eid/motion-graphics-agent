# Web Frontend

The `web/` workspace is the TanStack Start frontend for the editing-agent project.

It is responsible for:

- Chatting with the `planner-agent` through Mastra streaming endpoints
- Rendering the live Remotion preview
- Showing agent activity across Planner, Art Director, and Implementor
- Surfacing generated files in a read-only viewer

## Development

From the repo root:

```bash
bun run dev:web
```

Or from `web/`:

```bash
bun run dev
```

The app runs on `http://localhost:3000`.

## Backend Contract

The frontend streams chat responses from Mastra, typically through:

```text
http://localhost:4111/chat/planner-agent
```

The Planner may then route work internally to the Art Director and Implementor depending on the request.

## UI Responsibilities

- **Chat panel**: user messages, streamed assistant replies, status states
- **Preview panel**: Remotion `<Player>` for the current synced composition
- **Activity panel**: agent routing and execution state
- **File panel**: generated file tree and code viewer

The frontend should remain useful even when the Mastra server or sandbox is offline by handling connection failures gracefully.

## Current Stack

- TanStack Start
- React 19
- Tailwind CSS v4
- `@ai-sdk/react`
- Remotion Player
- TanStack Query

## Notes

- This workspace is not a generic starter anymore; repo-level docs should take precedence over upstream template guidance.
- Repo docs in `../docs/` describe the current architecture and implementation model.
