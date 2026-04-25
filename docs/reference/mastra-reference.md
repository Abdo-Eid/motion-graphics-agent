# Mastra Reference

Architecture, memory, RAG, and integration patterns for the editing-agent project. Based on actual Mastra docs fetched from mastra.ai.

---

## Two-Server Architecture

```
┌─────────────────────────────┐     HTTP SSE      ┌──────────────────────────────┐
│   Vite + React (:3000)      │ ◄─────────────── │   Mastra Server (:4111)      │
│   - Chat UI (useChat)       │                   │   - Planner agent            │
│   - Remotion <Player>       │                   │   - Editor agent             │
│   - Agent log               │                   │   - Motion agent             │
│   - File explorer           │                   │   - Memory (working + RAG)   │
└─────────────────────────────┘                   │   - MCP tools (sandbox)      │
                                                  └──────────────────────────────┘
```

The frontend never calls Z.AI directly. It streams from Mastra's `chatRoute()` via `useChat()` from `@ai-sdk/react`. Mastra handles all LLM calls server-side.

---

## Agent Setup

### Provider

Mastra has a built-in `zai-coding-plan` provider. No extra package needed. Just pass the model string:

```ts
model: 'zai-coding-plan/glm-4.7-flash'
```

Auth reads `ZHIPU_API_KEY` from `.env` automatically.

### Available Models

| Model | Notes |
|---|---|
| `glm-5.1` | Latest flagship |
| `glm-5` | Flagship, agent-optimized |
| `glm-4.7` | High-performance |
| `glm-4.7-flash` | Fast, good for POC |
| `glm-4.7-flashx` | Fast extended |
| `glm-4.6` | Previous-gen flagship |

### Agent Definition

```ts
import { Agent } from '@mastra/core/agent'

export const myAgent = new Agent({
  id: 'my-agent',
  name: 'My Agent',
  instructions: `...`,
  model: 'zai-coding-plan/glm-4.7-flash',
  tools: {},
})
```

---

## Three Agents

| Agent | id | Has Memory | Has Tools | Role |
|---|---|---|---|---|
| Planner | `planner-agent` | Yes | No (future) | Understands intent, produces scene plan, manages context |
| Editor | `editor-agent` | No | Yes (MCP, Phase 5) | Reads plan, loads skills, writes .tsx files, typecheck loop |
| Motion | `motion-agent` | No | Yes (MCP, Phase 5) | Reads editor's files, adds animations/transitions, typecheck loop |

### Planner

- Entry point for all user interactions
- Produces structured scene plans (not code)
- Asks clarifying questions before planning
- Only agent with memory

### Editor

- Receives scene plan from Planner
- Calls `list_skills()` / `load_skill()` before writing
- Writes `.tsx` Remotion composition files via `edit_file` / `create_file`
- Loops: edit → `run_typecheck()` → read errors → fix → repeat
- Stateless worker — no memory, receives instructions via planner output

### Motion

- Reads Editor's compositions after Editor is done
- Loads motion skills (`remotion-transitions`)
- Adds animations, transitions, effects via `edit_file` only (never creates files)
- Same typecheck feedback loop as Editor
- Optional `run_render_check()` at the end

---

## chatRoute()

`chatRoute()` from `@mastra/ai-sdk` exposes agent endpoints over HTTP SSE:

```ts
import { chatRoute } from '@mastra/ai-sdk'

export const mastra = new Mastra({
  agents: { plannerAgent, editorAgent, motionAgent },
  server: {
    apiRoutes: [
      chatRoute({ path: '/chat/:agentId' }),
    ],
  },
})
```

This creates:

- `POST /chat/planner-agent` → streams from `plannerAgent`
- `POST /chat/editor-agent` → streams from `editorAgent`
- `POST /chat/motion-agent` → streams from `motionAgent`

The `:agentId` param maps to the agent's `id` field.

The frontend consumes this with:

```ts
const { messages, input, handleInputChange, handleSubmit, status } = useChat({
  api: 'http://localhost:4111/chat/planner-agent',
})
```

---

## Memory

Mastra provides 4 composable memory layers. We use 3:

### 1. Message History (automatic)

Recent raw conversation messages. Configured via `lastMessages`:

```ts
options: {
  lastMessages: 20,
}
```

For long-running conversations, raw history grows until it fills the context window. Observational Memory solves this, but we skip it (our sessions are short).

### 2. Working Memory — structured scratchpad

Agent-controlled via an internal `updateWorkingMemory` tool call. Two scopes:

**Thread-scoped (per session)** — resets each conversation:

```ts
workingMemory: {
  enabled: true,
  scope: 'thread',
  template: `
# Session State
## Scene Plan
- 
## Assets
- 
## Current File Structure
- 
## Compiler Errors
- 
`,
}
```

**Resource-scoped (across sessions)** — persists per user:

```ts
workingMemory: {
  enabled: true,
  scope: 'resource',
  template: `
# User Preferences
## Style
- Colors:
- Fonts:
- Motion feel:
## Past Decisions
- 
`,
}
```

Can also use Zod schema instead of markdown template:

```ts
import { z } from 'zod'

workingMemory: {
  enabled: true,
  schema: z.object({
    style: z.object({
      colors: z.array(z.string()).optional(),
      motionFeel: z.string().optional(),
    }).optional(),
  }),
}
```

Both scopes can be enabled simultaneously on the same Memory instance — thread-scoped and resource-scoped working memory are independent.

### 3. Semantic Recall — RAG over past messages

Retrieves past messages by meaning, not recency. Requires vector store + embedder:

```ts
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { fastembed } from '@mastra/fastembed'

const memory = new Memory({
  storage: new LibSQLStore({ id: 'storage', url: 'file:./mastra.db' }),
  vector: new LibSQLVector({ id: 'vector', url: 'file:./mastra.db' }),
  embedder: fastembed,
  options: {
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: 'resource',
    },
  },
})
```

- `topK`: number of semantically similar messages to retrieve
- `messageRange`: include N messages before + after each match for context
- `scope: 'resource'`: search across all threads for this user

User says "use the same transitions as my last video" → semantic recall finds that past conversation.

### 4. Observational Memory — we don't need this

Background-agent compression for very long conversations (5–40x compression). Uses Observer + Reflector background agents. Our sessions are short (one video at a time), so skip it. Only supports `@mastra/pg`, `@mastra/libsql`, and `@mastra/mongodb`.

### Memory Processors

When memory is enabled, Mastra automatically adds processors to the agent pipeline:

1. `WorkingMemory` — injects working memory context
2. `MessageHistory` — retrieves/persists message history
3. `SemanticRecall` — retrieves semantically similar messages

If combined memory exceeds context limits, processors filter/trim content. Execution order: `[Memory Processors] → [Your inputProcessors]`. Output guardrails that call `abort()` prevent memory saves — safe by default.

### Memory Ownership

```
Planner → memory (message history + working memory thread + working memory resource + semantic recall)
Editor  → no memory
Motion  → no memory
```

Only the planner needs memory. Editor and Motion are stateless workers.

### Calling with Thread/Resource IDs

```ts
const response = await agent.generate('Hello!', {
  memory: {
    resource: 'user-123',
    thread: 'conversation-456',
  },
})
```

With `chatRoute()`, the frontend sends `resourceId` and `threadId` as part of the chat request body. `useChat()` supports this via its config.

### Sharing Memory Between Agents

Agents sharing the same `resourceId` share resource-scoped working memory and semantic embeddings — even across different threads:

```ts
await planner.generate('Plan a video', {
  memory: { resource: 'project-42', thread: 'planning' },
})
await editor.generate('Write the code', {
  memory: { resource: 'project-42', thread: 'editing' },
})
```

Both see the same resource-scoped working memory. Thread-scoped data stays separate.

In supervisor/subagent delegation, memory is **automatically isolated** — each subagent gets a fresh `threadId` and deterministic `resourceId` (`{parentResourceId}-{agentName}`).

---

## RAG Pipeline (Separate from Memory)

For indexing **external documents** — past `.tsx` compositions, product notes, style configs.

### Full Pipeline

```ts
import { MDocument } from '@mastra/rag'
import { createVectorQueryTool } from '@mastra/rag'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { embedMany } from 'ai'

// 1. Create document
const doc = MDocument.fromText('...')

// 2. Chunk
const chunks = await doc.chunk({
  strategy: 'recursive',
  maxSize: 512,
  overlap: 50,
})

// 3. Embed
const { embeddings } = await embedMany({
  values: chunks.map(c => c.text),
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})

// 4. Store
await vector.upsert({ indexName: 'past-compositions', vectors: embeddings, metadata: chunks.map(c => ({ text: c.text })) })

// 5. Query
const results = await vector.query({ indexName: 'past-compositions', queryVector, topK: 5 })
```

### Vector Query Tool for Agents

Gives agents a retrieval tool they can call directly:

```ts
import { createVectorQueryTool } from '@mastra/rag'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { LIBSQL_PROMPT } from '@mastra/libsql'

const vectorQueryTool = createVectorQueryTool({
  vectorStoreName: 'libsqlVector',
  indexName: 'past-compositions',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})
```

When using the vector query tool, include the store's prompt in agent instructions:

```ts
import { LIBSQL_PROMPT } from '@mastra/libsql'

export const editorAgent = new Agent({
  instructions: `
    You are a Remotion video editor.
    ${LIBSQL_PROMPT}
  `,
  tools: { vectorQueryTool },
})
```

`LIBSQL_PROMPT` tells the agent what query patterns and metadata filters are available for LibSQL specifically.

### `vectorStoreName` must match registration key

```ts
// In index.ts
export const mastra = new Mastra({
  vectors: { libsqlVector },
})

// In tool creation — must match the key above
createVectorQueryTool({ vectorStoreName: 'libsqlVector', ... })
```

### Chunking Strategies

| Strategy | Best for |
|---|---|
| `recursive` | General purpose — smart splitting on structure |
| `markdown` | Markdown-aware splitting |
| `semantic-markdown` | Groups by related header families |
| `html` | HTML structure-aware |
| `json` | JSON structure-aware |
| `sentence` | Preserves sentence boundaries |
| `token` | Token-aware splitting |
| `latex` | LaTeX structure-aware |
| `character` | Simple character-based splits |

### Embedding Model Options

| Provider | Package | Notes |
|---|---|---|
| `@mastra/fastembed` | `fastembed` from `@mastra/fastembed` | Local, no API key, good for POC |
| OpenAI `text-embedding-3-small` | `ModelRouterEmbeddingModel` | 1536d, high quality, needs `OPENAI_API_KEY` |
| Google `gemini-embedding-001` | `ModelRouterEmbeddingModel` | Needs `GOOGLE_API_KEY` |

Z.AI embedding support needs to be checked — may not have an embedding endpoint. Use `@mastra/fastembed` for POC.

### Reranking

Optional second pass to improve retrieval quality:

```ts
import { rerankWithScorer, MastraAgentRelevanceScorer } from '@mastra/rag'

const reranked = await rerankWithScorer({
  results: initialResults,
  query,
  scorer: new MastraAgentRelevanceScorer('scorer', 'openai/gpt-4o-mini'),
  options: {
    weights: { semantic: 0.5, vector: 0.3, position: 0.2 },
    topK: 5,
  },
})
```

Overkill for POC — plain vector similarity is sufficient.

### Metadata Filtering

All vector stores support MongoDB-style query syntax:

```ts
await vector.query({
  indexName: 'compositions',
  queryVector,
  topK: 10,
  filter: {
    type: 'scene',
    tags: { $in: ['intro', 'transition'] },
    $or: [
      { category: 'product-demo' },
      { category: 'screen-recording' },
    ],
  },
})
```

---

## Storage

### Recommended for POC: LibSQL (already installed)

`@mastra/libsql` is in `mastra/package.json`. Provides both storage backend and vector store:

```ts
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'

const storage = new LibSQLStore({ id: 'storage', url: 'file:./mastra.db' })
const vector = new LibSQLVector({ id: 'vector', url: 'file:./mastra.db' })
```

Single local SQLite file. No external DB needed for POC.

**Important:** Both constructors now require an `id` property (v1 migration). Index names for LibSQL must start with a letter or underscore and contain only letters, numbers, and underscores (no hyphens). LibSQL vector store currently only supports `cosine` similarity metric.

### Other Supported Backends

**Storage:** LibSQL, PostgreSQL (`@mastra/pg`), MongoDB, Upstash, Cloudflare D1, Convex, DynamoDB, LanceDB, MSSQL

**Vector:** 17+ stores including pgvector, Pinecone, Qdrant, Chroma, MongoDB, Elasticsearch, Cloudflare Vectorize, S3 Vectors, OpenSearch

All vector stores share the same interface: `createIndex`, `upsert`, `query`, `describeIndex`, `deleteIndex`, `listIndexes`, `updateVector`, `deleteVector`, `deleteVectors`.

### Composite Storage

Route different domains to different backends:

```ts
import { MastraCompositeStore } from '@mastra/core/storage'

new MastraCompositeStore({
  id: 'composite',
  domains: {
    memory: new LibSQLStore({ id: 'mem', url: 'file:./memory.db' }),
    workflows: new PgStore({ id: 'wf', connectionString: process.env.DATABASE_URL }),
  },
})
```

---

## Putting It Together — Full `index.ts`

Target state after Phase 5 (memory + sandbox tools):

```ts
import { Mastra } from '@mastra/core/mastra'
import { chatRoute } from '@mastra/ai-sdk'
import { Memory } from '@mastra/memory'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { fastembed } from '@mastra/fastembed'

const storage = new LibSQLStore({ id: 'storage', url: 'file:./mastra.db' })
const vector = new LibSQLVector({ id: 'vector', url: 'file:./mastra.db' })

const plannerMemory = new Memory({
  storage,
  vector,
  embedder: fastembed,
  options: {
    lastMessages: 20,
    workingMemory: {
      enabled: true,
      scope: 'thread',
      template: `
# Session State
## Scene Plan
- 
## Assets
- 
## Current File Structure
- 
## Compiler Errors
- 
`,
    },
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: 'resource',
    },
  },
})

import { plannerAgent } from './agents/planner'
import { editorAgent } from './agents/editor'
import { motionAgent } from './agents/motion'

export const mastra = new Mastra({
  storage,
  agents: {
    plannerAgent: new Agent({
      ...plannerAgent,
      memory: plannerMemory,
    }),
    editorAgent,
    motionAgent,
  },
  server: {
    apiRoutes: [
      chatRoute({ path: '/chat/:agentId' }),
    ],
  },
})
```

---

## Editor

A CMS-style system that separates agent configuration from code. Lets non-developers (prompt engineers, product teams) iterate on agent behavior without touching the codebase.

**What it does for us:**
- Version agent instructions — every save creates a snapshot, can roll back
- Edit prompts in Studio UI without redeploying
- A/B test different agent instructions against each other
- Override code-defined agent instructions at runtime (only `instructions` and `tools` are overridable — `id`, `name`, `model` stay from code)

**Setup:**

```ts
import { MastraEditor } from '@mastra/editor'

export const mastra = new Mastra({
  agents: { plannerAgent, editorAgent, motionAgent },
  editor: new MastraEditor(),
})
```

### Prompt Blocks

Reusable, versioned instruction templates with template variables and display conditions:

```ts
const editor = mastra.getEditor()
await editor.prompt.create({
  id: 'video-style',
  name: 'Video Style',
  content: 'You create {{videoStyle || "professional"}} videos at {{fps}}fps.',
})
```

- `{{variable}}` syntax with defaults: `{{fps || "30"}}`
- Display conditions: show/hide blocks based on context (e.g. only show "screen-recording" block when `videoType === "demo"`)
- Blocks compose into an agent's instructions — inline text + prompt block references

### Tools via Editor

Three sources merge in order: code tools → integration tools (Composio, Arcade) → MCP tools. Later sources override earlier ones with the same ID.

MCP clients can be configured as stored definitions and added to any agent through Studio. Tools from MCP servers are namespaced (`serverName_toolName`).

### Versioning

Every save creates a versioned snapshot: Draft → Published → Archived. Only one published version at a time. Route traffic by version ID for A/B testing or canary rollouts.

### Relevance to Our Project

Useful for iterating on planner instructions without redeploying. A prompt engineer could tune the scene plan format, add clarification rules, or test different instruction phrasings — all through Studio. Not needed for Phase 3 but worth adding once agents are stable.

---

## Workspaces

A workspace gives agents a persistent environment for files, command execution, search, and skills. Built into `@mastra/core` (no extra package).

**Four features:**

| Feature | What it gives agents |
|---|---|
| Filesystem | `read_file`, `write_file`, `list_directory`, `grep`, `copy`, `move`, `delete` |
| Sandbox | `execute_command`, `get_process_output`, `kill_process` |
| Search | BM25 keyword, vector semantic, or hybrid search over indexed files |
| Skills | Reusable instruction files (`SKILL.md`) for agents |

**Setup:**

```ts
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
  skills: ['/skills'],
})

const mastra = new Mastra({ workspace })
// or per-agent: new Agent({ ..., workspace })
```

### Filesystem

`LocalFilesystem` points at a local directory. Agents read, write, list, delete, grep files. Supports read-only mode. Can enforce `requireReadBeforeWrite` to prevent blind overwrites.

### Sandbox

`LocalSandbox` executes shell commands on the local machine. Other providers: `E2BSandbox`, `DaytonaSandbox`, `BlaxelSandbox` for cloud isolation.

Background processes supported (dev servers, watchers) with callbacks for stdout/stderr/exit.

### Search

Index workspace files for BM25 keyword search, vector semantic search, or hybrid. Agents get `search_content` and `index_content` tools.

### Skills

`skills: ['/skills']` points at directories with `SKILL.md` files. Agents discover and load skills as instructions. Follows the Agent Skills spec.

### Tool Configuration

Fine-grained control per tool:

```ts
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  tools: {
    enabled: true,
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireApproval: true,
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { maxOutputTokens: 5000 },
  },
})
```

Can rename tools (`name: 'view'` instead of default `mastra_workspace_read_file`).

### Relevance to Our Project

**Workspaces overlap significantly with our Docker sandbox design.** Our project already planned:

| Our sandbox (Phase 4-5) | Mastra Workspace equivalent |
|---|---|
| MCP server with `read_file`, `edit_file`, `create_file` | Filesystem tools (`read_file`, `write_file`) |
| MCP server with `run_typecheck()`, `run_render_check()` | Sandbox tools (`execute_command`) |
| `/.skills/remotion.md`, etc. | Workspace skills (`SKILL.md` files) |
| `grep(pattern)` tool | Filesystem grep tool |
| `get_pending_changes()` for preview sync | No equivalent (custom) |
| Docker isolation | `LocalSandbox` or `E2BSandbox` |

**Two options:**

1. **Use Mastra Workspaces instead of our custom Docker sandbox** — less code to write, built-in tools, but we lose Docker isolation and our custom `edit_file` search-and-replace semantics. Also no `get_pending_changes()` for preview sync.

2. **Keep our Docker sandbox** — more control, proper isolation, custom edit semantics, preview sync. Workspaces don't fit our architecture because our sandbox runs inside a container, not on the host filesystem.

**Recommendation:** Keep the Docker sandbox (Phase 4-5 as planned). Our `edit_file` search-and-replace pattern and `get_pending_changes()` diff sync are core to the architecture. Mastra Workspaces are designed for local/cloud filesystems, not containerized MCP servers. However, we could use the workspace `skills` feature for loading Remotion docs instead of our custom `list_skills`/`load_skill` MCP tools — but only if we adopt workspaces for the whole thing.

---

## Packages to Install (not yet installed)

| Package | Purpose | When |
|---|---|---|
| `@mastra/fastembed` | Local embeddings, no API key | Phase 5 (memory) |
| `@mastra/rag` | MDocument, createVectorQueryTool, reranking | Phase 5+ (RAG) |
| `@mastra/editor` | CMS-style agent config management | Post-POC (optional) |

---

## Installed Packages

From `mastra/package.json`:

| Package | Version | Purpose |
|---|---|---|
| `@mastra/core` | ^1.25.0 | Agent, Mastra, model router |
| `@mastra/ai-sdk` | ^1.4.0 | `chatRoute()` for HTTP SSE endpoints |
| `@mastra/memory` | ^1.15.1 | Memory class (working memory, semantic recall) |
| `@mastra/libsql` | ^1.8.1 | Storage + vector store backend |
| `mastra` | ^1.6.0 | CLI (`mastra dev`, `mastra build`) |
| `zod` | 4 | Schema validation |

---

## Commands

```bash
cd mastra && bun run dev     # Start Mastra dev server on :4111
cd mastra && bun run build   # Build for production
cd mastra && bun run start   # Start production server
```

---

## References

- Mastra docs: https://mastra.ai/docs
- Z.AI provider: https://mastra.ai/models/providers/zai-coding-plan
- Memory overview: https://mastra.ai/docs/memory/overview
- Working memory: https://mastra.ai/docs/memory/working-memory
- Semantic recall: https://mastra.ai/docs/memory/semantic-recall
- Observational memory: https://mastra.ai/docs/memory/observational-memory
- Memory processors: https://mastra.ai/docs/memory/memory-processors
- RAG overview: https://mastra.ai/docs/rag/overview
- RAG retrieval: https://mastra.ai/docs/rag/retrieval
- RAG chunking & embedding: https://mastra.ai/docs/rag/chunking-and-embedding
- LibSQL vector store: https://mastra.ai/reference/vectors/libsql
- LibSQL storage: https://mastra.ai/reference/storage/libsql
- AI SDK + Mastra blog: https://mastra.ai/blog/using-ai-sdk-with-mastra
- Project architecture: `docs/editing agent.md`
- Docker sandbox: `docs/Building a Local Docker Sandbox for Agentic Apps.md`
- Detailed learnings: `docs/reference/mastra-learnings.md`
- Editor overview: https://mastra.ai/docs/editor/overview
- Editor prompts: https://mastra.ai/docs/editor/prompts
- Editor tools: https://mastra.ai/docs/editor/tools
- Workspace overview: https://mastra.ai/docs/workspace/overview
- Workspace sandbox: https://mastra.ai/docs/workspace/sandbox
- Workspace filesystem: https://mastra.ai/docs/workspace/filesystem
- Workspace skills: https://mastra.ai/docs/workspace/skills
- Workspace search: https://mastra.ai/docs/workspace/search
- Workspaces blog: https://mastra.ai/blog/announcing-mastra-workspaces
