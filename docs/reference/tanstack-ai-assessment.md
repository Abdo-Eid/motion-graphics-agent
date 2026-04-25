# TanStack AI vs Vercel AI SDK — Assessment

> **Date:** April 20, 2026  
> **Decision:** Stick with Vercel AI SDK  
> **Revisit when:** Mastra supports AG-UI Protocol, or TanStack AI adds a Vercel compatibility layer, or TanStack AI hits v1

---

## TanStack AI Overview

TanStack AI (`@tanstack/ai@0.10.1`, alpha) is a provider-agnostic, type-safe AI SDK with server-route integrations for full-stack React apps.

**Core packages:**

| Package | Purpose |
|---|---|
| `@tanstack/ai` | Server-side core: `chat()`, `generateImage()`, `summarize()`, `toServerSentEventsResponse()` |
| `@tanstack/ai-react` | React hooks: `useChat()` |
| `@tanstack/ai-client` | Headless chat client, connection adapters |
| `@tanstack/ai-openai` / `ai-anthropic` / `ai-gemini` | Provider adapters (tree-shakeable per activity) |

**Key capabilities:**

- `useChat()` with streaming via SSE, HTTP stream, RPC, or custom async iterables
- `toolDefinition()` — isomorphic tools with `.server()` / `.client()` split
- AG-UI Protocol for streaming (RUN_STARTED, TEXT_MESSAGE_CONTENT, TOOL_CALL_START, etc.)
- Middleware system with lifecycle hooks (onChunk, onBeforeToolCall, onAfterToolCall, etc.)
- Composable agent loop strategies (`maxIterations()`, `untilFinishReason()`, `combineStrategies()`)
- Per-model type safety — TypeScript narrows options based on selected model
- First-class server-route integration for full-stack React apps

**Current state:** Alpha but maturing fast. API surface is stabilizing. Breaking changes still possible. No built-in UI components yet (headless only).

---

## The Dealbreaker: Protocol Mismatch

Mastra and TanStack AI **speak different streaming protocols**.

| | Mastra `chatRoute()` | TanStack AI `useChat()` |
|---|---|---|
| **Protocol** | Vercel AI SDK UI Message Stream | AG-UI Protocol |
| **SSE events** | `0:`, `9:`, `e:`, `d:` prefixed | `RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, etc. |

Pointing TanStack AI's `fetchServerSentEvents('http://localhost:4111/chat/planner-agent')` at a Mastra server will **silently fail or throw parse errors**. This is not a configuration fix — it's a protocol mismatch.

---

## The 3 Bridging Options (and why each is bad for a POC)

### Option 1: Custom SSE Translator

Write a translator that parses Vercel AI SDK SSE events and emits AG-UI events.

- 200+ lines of non-trivial, brittle code
- Breaks whenever either SDK changes its streaming format
- Not worth the engineering cost for a POC

### Option 2: `@ag-ui/mastra` Bridge

Use the existing `@ag-ui/mastra` package (v1.0.1) which wraps Mastra agents in AG-UI Protocol.

- Pulls in CopilotKit runtime as a peer dependency
- Creates an indirect dependency chain (`@ag-ui/mastra` → `@copilotkit/runtime` → `@ag-ui/client`)
- Designed for CopilotKit runtime, not TanStack AI
- Still need to verify it works with TanStack AI's specific SSE consumption

### Option 3: Ditch Mastra Server Entirely

Use TanStack AI server routes that import Mastra agents directly, bypassing `chatRoute()`.

- Loses Mastra's memory, workflows, streaming helpers
- Only keeps agent definitions — Mastra becomes just a library
- Major architectural change that undermines the two-server design

---

## Migration Mapping (For Future Reference)

| Vercel AI SDK | TanStack AI | Notes |
|---|---|---|
| `useChat()` from `@ai-sdk/react` | `useChat()` from `@tanstack/ai-react` | Same name, different message types |
| `DefaultChatTransport` | `fetchServerSentEvents(url)` | Connection adapter pattern |
| `streamText()` | `chat()` | Server-side streaming |
| `toUIMessageStreamResponse()` | `toServerSentEventsResponse()` | SSE response helper |
| `tool()` from `ai` | `toolDefinition()` from `@tanstack/ai` | Isomorphic: `.server()` + `.client()` |
| AI Elements (`<MessageResponse>`, `<Tool>`) | No equivalent | Headless only — build your own |
| `maxSteps` agent loop | `agentLoopStrategy: combineStrategies([...])` | More flexible composable approach |

---

## What You'd Gain vs. Lose

### Gain

- Per-model type safety (nice but not critical for a POC)
- Tree-shakeable adapters (marginal bundle improvement)
- Composable agent loop strategies (you'd lose Mastra's built-in orchestration)
- Cleaner TanStack ecosystem alignment

### Lose

- Official Mastra support and documented integration path
- `@mastra/ai-sdk` stream transformers (`toAISdkStream()`, `handleChatStream()`)
- Battle-tested Mastra + `useChat()` streaming
- AI Elements UI components (you'd build everything from scratch)
- Every Mastra community example and troubleshooting resource assumes Vercel AI SDK

---

## When to Revisit

- Mastra natively supports AG-UI Protocol output (no timeline announced)
- TanStack AI adds a Vercel AI SDK compatibility transport layer
- `@ag-ui/mastra` decouples from CopilotKit and becomes a standalone bridge
- TanStack AI hits v1 with stable API

The existing note in `editing agent.md` is still correct:

> *"Why not TanStack AI yet? TanStack AI is currently in alpha. Same type-safety-first philosophy as the rest of the ecosystem, but too early for a POC. Revisit when it hits v1."*
