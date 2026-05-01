# Mastra Learnings

> **Historical reference (April 2026).** Framework-level notes from reading Mastra's docs. Mostly still accurate at the API level, but a few examples (notably the "Key Takeaways" section) reference the rejected Docker sandbox. The active sandbox design is `docs/local-sandbox-service-design.md`.

Detailed notes from reading Mastra's actual documentation pages. This is for learning — not project-specific. For the project reference, see `mastra-reference.md`.

---

## 1. Memory System

Mastra memory has 4 layers. They are composable — enable whichever ones you need on a single `Memory` instance.

### Message History

The most basic layer. Every message (user, assistant, tool results) gets persisted. Configured with `lastMessages: N` to control how many recent messages are injected into the context.

- Stored per thread (conversation) and resource (user)
- Automatically created when you call `agent.generate()` or `agent.stream()` with `memory: { resource, thread }`
- For long conversations, raw history fills the context window → this is what Observational Memory solves

```ts
const memory = new Memory({
  options: {
    lastMessages: 20,
  },
})
```

### Working Memory

A structured scratchpad the agent can update via an internal tool call (`updateWorkingMemory`). Think of it as a sticky note the agent keeps about the user or the current task.

**Two scopes that can coexist:**

1. **Thread-scoped** (`scope: 'thread'`) — isolated per conversation. Resets when a new thread starts. Good for session state.
2. **Resource-scoped** (`scope: 'resource'`) — persists across all threads for a user. Good for user profiles and preferences.

You can enable both at the same time on the same Memory instance.

**Template format** — Markdown string that defines the structure:

```ts
workingMemory: {
  enabled: true,
  scope: 'resource',
  template: `
# User Profile
- **Name**:
- **Preferences**:
- **Goals**:
`,
}
```

The agent fills in the fields and updates them over time. A well-structured template makes it easier for the agent to parse and update.

**Schema format** — Zod schema instead of Markdown:

```ts
workingMemory: {
  enabled: true,
  schema: z.object({
    name: z.string().optional(),
    preferences: z.object({
      style: z.string().optional(),
    }).optional(),
  }),
}
```

Schema-based uses merge semantics — partial updates merge with existing data.

**Supported storage:** LibSQL, PostgreSQL, Upstash, MongoDB.

### Semantic Recall

RAG over past conversation messages. Instead of just returning the last N messages, it finds semantically similar past messages regardless of when they occurred.

**Requires:** vector store + embedder (not optional).

```ts
semanticRecall: {
  topK: 3,          // retrieve 3 most similar messages
  messageRange: 2,  // include 2 messages before + after each match for context
  scope: 'resource', // search across all threads for this user
}
```

How it works: each message gets embedded and stored in the vector store. When a new message comes in, its embedding is used to find similar past messages. The `messageRange` grabs surrounding context so you don't just get a single disconnected message.

The `scope: 'resource'` setting means it searches across all of a user's threads, not just the current one. This is what enables "remember what I said in that other conversation."

### Observational Memory

The most advanced layer. Uses two background agents:

1. **Observer** — compresses raw messages into dense observation logs (5–40x compression)
2. **Reflector** — condenses observations when they grow too long

Think of it as how human memory works: you don't remember every word, you observe what happened and your brain compresses it into long-term memory.

Key properties:
- Async buffering — observations pre-compute in background, no agent pause
- Prompt cacheable — stable context prefix reduces costs
- Token-tiered model selection — different models for different input sizes
- Achieved 94.87% on LongMemEval (SOTA at time of writing)

Only supports `@mastra/pg`, `@mastra/libsql`, and `@mastra/mongodb` for storage.

**We don't need this** — our sessions are short (one video at a time, maybe 20-30 minutes of conversation). Raw message history + working memory is sufficient.

### Memory Processors

When memory is enabled, Mastra automatically adds processors to the agent's pipeline:

1. `WorkingMemory` processor — injects working memory context
2. `MessageHistory` processor — retrieves and persists message history
3. `SemanticRecall` processor — retrieves semantically similar messages

Execution order on input: `[Memory Processors] → [Your custom inputProcessors]`

If combined memory exceeds the model's context limit, processors filter, trim, or prioritize content automatically.

Output guardrails that call `abort()` prevent memory from saving — safe by default (nothing inappropriate gets persisted).

### Threads and Resources

Every memory call needs two IDs:

- `resource` — stable identifier for the user/entity. Think "user ID"
- `thread` — conversation session ID. Think "chat session ID"

**Important rules:**
- Each thread has an owner (`resourceId`) that can't be changed after creation
- Don't reuse the same thread ID for different resources — causes query errors
- Threads and messages are created automatically on `agent.generate()` / `agent.stream()`

### Memory in Multi-Agent Systems

**Supervisor/subagent delegation** — memory is automatically isolated:
- Each subagent gets a fresh `threadId`
- Deterministic `resourceId`: `{parentResourceId}-{agentName}`
- Resource-scoped memory persists between delegations (subagent remembers from last time)
- Two different subagents never share a resource ID through delegation

**Manual sharing** — agents sharing the same `resource` ID share resource-scoped working memory and semantic embeddings, even across different threads:

```ts
await agentA.generate('...', { memory: { resource: 'project-42', thread: 'session-a' } })
await agentB.generate('...', { memory: { resource: 'project-42', thread: 'session-b' } })
// Both see the same resource-scoped working memory
```

Thread-scoped data stays separate.

### Switching Memory Per Request

Memory can be a function that reads from `RequestContext`:

```ts
memory: ({ requestContext }) => {
  const tier = requestContext.get('user-tier')
  return tier === 'enterprise' ? premiumMemory : standardMemory
}
```

---

## 2. LibSQL Vector Store

Part of the `@mastra/libsql` package — same package as the storage backend, different class.

### Constructor

```ts
import { LibSQLVector } from '@mastra/libsql'

const store = new LibSQLVector({
  id: 'my-vector-store',
  url: 'file:./vectors.db',
  authToken: '...', // only for Turso cloud
})
```

**v1 migration note:** Constructor now requires an `id` property. The old `connectionUrl` parameter was renamed to `url`.

### Index Name Rules

LibSQL index names must:
- Start with a letter or underscore
- Contain only letters, numbers, and underscores
- Example: `my_index_123` ✓ | `my-index` ✗ (no hyphens)

### Supported Metric

Only `cosine` similarity is currently supported by libSQL. The `metric` parameter accepts `'cosine' | 'euclidean' | 'dotproduct'` but only cosine works.

### Full API

```ts
// Create an index
await store.createIndex({ indexName: 'my_collection', dimension: 1536 })

// Upsert vectors with metadata (atomic — transaction, rolls back on failure)
await store.upsert({
  indexName: 'my_collection',
  vectors: [[0.1, 0.2, ...], [0.3, 0.4, ...]],
  metadata: [{ text: 'doc 1', category: 'A' }, { text: 'doc 2', category: 'B' }],
  ids: ['id1', 'id2'], // optional, auto-generated if omitted
})

// Query (semantic search)
const results = await store.query({
  indexName: 'my_collection',
  queryVector: [0.1, 0.2, ...],
  topK: 10,
  filter: { category: 'A' },      // metadata filtering
  includeVector: false,             // include raw vectors in results (default: false)
  minScore: 0,                      // minimum similarity threshold
})

// Describe an index
const stats = await store.describeIndex({ indexName: 'my_collection' })
// Returns: { dimension: 1536, count: 42, metric: 'cosine' }

// Delete index (and all data)
await store.deleteIndex({ indexName: 'my_collection' })

// List all indexes
const indexes = await store.listIndexes()

// Truncate index (remove vectors, keep structure)
await store.truncateIndex({ indexName: 'my_collection' })

// Update a single vector by ID or filter
await store.updateVector({
  indexName: 'my_collection',
  id: 'vec-1',                      // OR filter: { category: 'old' }
  update: {
    vector: [0.5, 0.6, ...],
    metadata: { text: 'updated' },
  },
})

// Delete single vector
await store.deleteVector({ indexName: 'my_collection', id: 'vec-1' })

// Delete multiple vectors
await store.deleteVectors({
  indexName: 'my_collection',
  ids: ['vec-1', 'vec-2'],          // OR filter: { category: 'expired' }
})
```

### Query Result Format

```ts
interface QueryResult {
  id: string
  score: number
  metadata: Record<string, any>
  vector?: number[]  // only if includeVector: true
}
```

### Local Embeddings with fastembed

`@mastra/fastembed` provides local embeddings with no API key:

```ts
import { fastembed } from '@mastra/fastembed'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

const agent = new Agent({
  memory: new Memory({
    storage: new LibSQLStore({ id: 'storage', url: 'file:./db.sqlite' }),
    vector: new LibSQLVector({ id: 'vector', url: 'file:./db.sqlite' }),
    embedder: fastembed,
    options: {
      lastMessages: 10,
      semanticRecall: { topK: 3, messageRange: 2 },
    },
  }),
})
```

`fastembed` runs locally, no network calls, no API key. Good for POC. Quality is lower than OpenAI embeddings but sufficient for development.

---

## 3. RAG Pipeline

Mastra's RAG system covers the full lifecycle: document → chunk → embed → store → retrieve → rerank.

### Document Creation

```ts
import { MDocument } from '@mastra/rag'

const docFromText = MDocument.fromText('plain text...')
const docFromHTML = MDocument.fromHTML('<html>...</html>')
const docFromMarkdown = MDocument.fromMarkdown('# markdown...')
const docFromJSON = MDocument.fromJSON('{ "key": "value" }')
```

### Chunking Strategies

| Strategy | When to use |
|---|---|
| `recursive` | General purpose. Splits on structure (paragraphs, sentences). Default choice. |
| `markdown` | Markdown docs where heading structure matters |
| `semantic-markdown` | Groups by related header families. Uses LLM calls. |
| `html` | HTML content, preserves DOM structure |
| `json` | JSON data, preserves object/array boundaries |
| `sentence` | When sentence boundaries must be preserved |
| `token` | When exact token count matters |
| `latex` | LaTeX documents |
| `character` | Simplest — fixed character count |

```ts
const chunks = await doc.chunk({
  strategy: 'recursive',
  maxSize: 512,
  overlap: 50,
  separators: ['\n'],
  extract: { metadata: true }, // optional, may use LLM calls
})
```

### Embedding Generation

Mastra uses the model router for embeddings. The `ModelRouterEmbeddingModel` class accepts `provider/model` strings:

```ts
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { embedMany } from 'ai'

const { embeddings } = await embedMany({
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  values: chunks.map(c => c.text),
})
```

**Supported embedding providers:** OpenAI and Google through the model router. Also `@mastra/fastembed` for local. Also Cohere via direct string `'cohere/embed-english-v3.0'`.

**Dimension configuration:**

```ts
// OpenAI — reduce dimensions
new ModelRouterEmbeddingModel('openai/text-embedding-3-small', { dimensions: 256 })

// Default is 1536 for text-embedding-3-small
// MUST match the dimension used in createIndex()
```

**Critical:** The vector store index dimension must match the embedding model output dimension. Mismatch causes errors or data corruption.

### Vector Query Tool

Gives agents a retrieval tool they call themselves:

```ts
import { createVectorQueryTool } from '@mastra/rag'

const tool = createVectorQueryTool({
  vectorStoreName: 'myVectorStore',  // must match key in new Mastra({ vectors: { ... } })
  indexName: 'my_index',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})
```

**`vectorStoreName`** is a string that must match the key you used when registering the vector store in your Mastra instance:

```ts
export const mastra = new Mastra({
  vectors: { myVectorStore: vectorInstance },
})
```

When the agent calls this tool, Mastra handles embedding the query, searching the vector store, and returning results — the agent just passes a query string.

### Vector Store Prompts

Each vector store has a prompt constant that tells the agent about available query patterns and filter syntax. Import it and include in agent instructions:

```ts
import { LIBSQL_PROMPT } from '@mastra/libsql'
import { PGVECTOR_PROMPT } from '@mastra/pg'
import { PINECONE_PROMPT } from '@mastra/pinecone'
// etc.

new Agent({
  instructions: `
    You are a helpful assistant.
    ${LIBSQL_PROMPT}
  `,
  tools: { search: vectorQueryTool },
})
```

Without this prompt, the agent won't know what filter operators are available for your specific vector store.

### Metadata Filtering

All vector stores support MongoDB-style query syntax for filtering:

```ts
// Simple equality
filter: { source: 'article.txt' }

// Numeric comparison
filter: { price: { $gt: 100 } }

// Multiple conditions (implicit AND)
filter: { category: 'electronics', price: { $lt: 1000 }, inStock: true }

// Array operations
filter: { tags: { $in: ['sale', 'new'] } }

// Logical operators
filter: {
  $or: [{ category: 'electronics' }, { category: 'accessories' }],
  $and: [{ price: { $gt: 50 } }, { price: { $lt: 200 } }],
}
```

Available operators: `$not`, `$and`, `$or`, `$in`, `$gt`, `$gte`, `$lt`, `$lte`, `$eq`, `$ne`.

### Reranking

Optional second pass to improve retrieval quality. More expensive but more accurate — uses cross-attention between query and documents.

```ts
import { rerankWithScorer, MastraAgentRelevanceScorer } from '@mastra/rag'

const reranked = await rerankWithScorer({
  results: initialVectorResults,
  query: 'user query',
  scorer: new MastraAgentRelevanceScorer('scorer', 'openai/gpt-4o-mini'),
  options: {
    weights: {
      semantic: 0.5,   // semantic understanding of relevance
      vector: 0.3,     // original vector similarity score
      position: 0.2,   // preserves original ordering
    },
    topK: 5,
  },
})
```

Other scorer options: `CohereRelevanceScorer`, `ZeroEntropyRelevanceScorer`.

For reranking to work, each result must include text content in `metadata.text`.

### GraphRAG

Combines vector similarity with knowledge graph traversal for relationship-aware retrieval. Creates a graph where nodes = documents, edges = semantic relationships.

```ts
import { GraphRAG } from '@mastra/rag'

const graphRag = new GraphRAG({ dimension: 1536, threshold: 0.7 })
await graphRag.createGraph(chunks)
```

Overkill for our use case — we're not dealing with interconnected documents.

---

## 4. LibSQL Storage Backend

Separate from the vector store. Stores message history, workflow snapshots, traces, and eval scores.

```ts
import { LibSQLStore } from '@mastra/libsql'

const storage = new LibSQLStore({
  id: 'my-storage',
  url: 'file:./storage.db',         // local file
  // url: ':memory:',               // in-memory (resets on process change)
  // url: 'libsql://db.turso.io',   // Turso cloud
  // authToken: '...',              // for Turso
})
```

**Important:** File storage (`file:...`) doesn't work with serverless platforms that have ephemeral file systems. For serverless, use Turso cloud or another remote backend.

Use `:memory:` only for development — data resets when the process restarts.

The `id` property is required (v1 migration).

---

## 5. Mastra Configuration Reference

### `vectors` (top-level)

Register vector stores that can be referenced by name in tools:

```ts
export const mastra = new Mastra({
  vectors: {
    myPinecone: new PineconeVector({ id: 'p', apiKey: process.env.PINECONE_API_KEY }),
    myLibsql: new LibSQLVector({ id: 'l', url: 'file:./vectors.db' }),
  },
})
```

### `storage` (top-level)

Single storage provider for the whole instance:

```ts
export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'storage', url: 'file:./mastra.db' }),
})
```

### `memory` (top-level)

Named memory instances that can be shared:

```ts
export const mastra = new Mastra({
  memory: {
    conversationMemory: new Memory({ ... }),
    analyticsMemory: new Memory({ ... }),
  },
})
```

Access via `mastra.listMemory()`.

---

## 7. Editor

The Mastra Editor is a CMS-style system that separates agent configuration from code. It lets non-developers iterate on agent behavior without touching the codebase.

### What It Does

Think of it like a headless CMS for agents. Your code defines the base agent (id, name, model, tools). The editor lets you override and extend `instructions` and `tools` through a UI (Studio) or API — without redeploying.

### Setup

```ts
import { MastraEditor } from '@mastra/editor'

export const mastra = new Mastra({
  agents: { myAgent },
  editor: new MastraEditor(),
})
```

One line. After that, Studio shows an "Editor" tab on each agent.

### What Can Be Overridden

Only two fields:
- **Instructions** — replace or extend the system prompt using prompt blocks
- **Tools** — add tools from integration providers, MCP clients, or override tool descriptions

Fields like `id`, `name`, and `model` stay from code and can't be changed through the editor.

### Prompt Blocks

Reusable instruction templates. Three block types in an agent's instruction list:

1. **Inline text** — free-form text, lives only on that agent
2. **Prompt block** — standalone block stored in the agent snapshot
3. **Prompt block reference** — pointer to a saved prompt block, resolved at runtime

**Template variables:**
```
You are helping {{userName}} with their {{task || 'request'}}.
```
- `{{variableName}}` — replaced with value, left as-is if not found
- `{{nested.path.value}}` — dot-notation resolution
- `{{variable || 'default'}}` — fallback when missing

Variables come from agent `variables` config or request context.

**Display conditions:** Each block can have rules that control whether it's included. Uses operators: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `in`, `exists`, etc. Rule groups can be nested with AND/OR logic.

Example: only show the "screen-recording instructions" block when `videoType === "demo"`.

### Tool Management via Editor

Three tool sources merge in order:
1. Code tools (already in your Mastra instance)
2. Integration tools (Composio, Arcade)
3. MCP tools (configured as stored MCP client definitions)

Later sources override earlier ones with the same ID. Every tool can have its description overridden at the agent level.

MCP clients configured through the editor support stdio and HTTP transports. Tools are namespaced (`serverName_toolName`).

### Versioning

Every save creates a versioned snapshot with one of three statuses:

| Status | Meaning |
|---|---|
| Draft | Latest working copy. Every save creates a new draft. |
| Published | Active version used in production. Only one at a time. |
| Archived | Previous published version. Can be restored. |

Flow: edit draft → test → publish (old published becomes archived).

**Version targeting:** Route different requests to different versions:
- A/B testing: split traffic between versions
- Canary: send small % to new version
- Per-user: pin specific users to a version
- Environment: draft in staging, published in production

```ts
// Load specific version
const agent = mastra.getAgentById('support-agent', { versionId: 'abc-123' })
const agent = mastra.getAgentById('support-agent', { status: 'draft' })
```

### Programmatic API

Everything Studio does is also available via code:

```ts
const editor = mastra.getEditor()

await editor.agent.create({ id: 'my-agent', instructions: '...' })
await editor.agent.update({ id: 'my-agent', instructions: 'updated...' })
await editor.agent.getById('my-agent')
await editor.agent.list()
await editor.agent.delete('my-agent')

await editor.prompt.create({ id: 'brand-voice', name: 'Brand voice', content: '...' })
await editor.prompt.update({ id: 'brand-voice', content: 'updated...' })
```

Also available over HTTP (`/stored/agents`, `/stored/prompt-blocks`).

### Automated Experimentation Loop

Because stored agents are just data, you can build automation:
1. Run a dataset through the current agent version, score results
2. Have another agent read failing cases and propose instruction changes
3. Apply changes via `editor.agent.update()` (creates new draft)
4. Re-run experiment against the draft, compare scores
5. Promote draft to published when scores improve

---

## 8. Workspaces

A workspace gives agents a persistent environment for files, commands, search, and skills. Built into `@mastra/core` since v1.1.0 — no extra package.

### Four Features

| Feature | Tools agents get | Provider |
|---|---|---|
| Filesystem | `read_file`, `write_file`, `list_directory`, `grep`, `copy`, `move`, `delete` | `LocalFilesystem`, `S3Filesystem`, `GCSFilesystem` |
| Sandbox | `execute_command`, `get_process_output`, `kill_process` | `LocalSandbox`, `E2BSandbox`, `DaytonaSandbox`, `BlaxelSandbox` |
| Search | `search_content`, `index_content` | BM25, vector, or hybrid |
| Skills | Auto-discovered `SKILL.md` files | Skill directories |

### Setup

```ts
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
  skills: ['/skills'],
})

// Global — all agents inherit
const mastra = new Mastra({ workspace })

// Or per-agent
const agent = new Agent({ id: 'my-agent', workspace })
```

### Filesystem

`LocalFilesystem` wraps a local directory. All file paths resolve relative to `basePath`. Can be read-only.

Key detail: `basePath` with a relative path resolves from `process.cwd()`. In `mastra dev`, cwd is `./src/mastra/public/`. Use absolute paths or env vars for consistency.

### Sandbox

`LocalSandbox` executes shell commands on the local machine. Not truly isolated — commands run as the host user. For real isolation, use `E2BSandbox` or `DaytonaSandbox`.

Background processes: `execute_command` accepts `background: true`. Returns a PID. Then `get_process_output` and `kill_process` manage it. Callbacks for stdout/stderr/exit.

Abort signal: by default, background processes die when the agent disconnects. Set `abortSignal: null` to let them survive.

### Search

Index workspace content for retrieval:
- **BM25**: keyword search (like a search engine)
- **Vector**: semantic search using embeddings
- **Hybrid**: combines both

```ts
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  search: { type: 'hybrid', autoIndexPaths: ['/docs', '/skills'] },
})
```

`autoIndexPaths` auto-indexes files on init.

### Skills

`skills: ['/skills']` points at directories containing `SKILL.md` files. Each skill has instructions, optional reference docs, and optional scripts. Agents discover available skills and load them as context.

This follows the Agent Skills spec — an open standard for reusable agent instructions.

### Tool Configuration

Fine-grained per-tool control:

```ts
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
  tools: {
    enabled: true,                           // global default
    requireApproval: false,                  // global default
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireApproval: true,                 // writes need approval
      requireReadBeforeWrite: true,          // must read before writing
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      enabled: false,                        // disable delete entirely
    },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      maxOutputTokens: 5000,                 // truncate output at 5000 tokens
      name: 'execute_command',               // rename from default mastra_workspace_execute_command
    },
  },
})
```

Dynamic configuration — `enabled` and `requireApproval` accept functions that receive context:

```ts
[WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
  enabled: async ({ requestContext }) => requestContext['allowExecution'] === 'true',
  requireApproval: async ({ args }) => (args.command as string).includes('rm'),
},
```

### Read-Before-Write Safety

When `requireReadBeforeWrite` is enabled:
- New files: can write without reading
- Existing files: must read first
- If file changed since last read: write fails with `StaleFileError`

Two layers of enforcement: tool-level read tracker + filesystem-level mtime check.

### Output Truncation

Workspace tools auto-truncate large outputs:
1. Line-based tail: last 200 lines by default (configurable via `tail` param)
2. Token-based limit: 2000 tokens default (configurable via `maxOutputTokens`)
3. ANSI escape codes stripped automatically

### Configuration Patterns

| Scenario | Pattern |
|---|---|
| Local dev with files + commands | `filesystem` + `sandbox` (both local, same dir) |
| Cloud storage + cloud sandbox | `mounts` + `sandbox` (FUSE-mount S3/GCS into sandbox) |
| Multiple cloud providers | `mounts` + `sandbox` (one mount per provider) |
| Files only, no commands | `filesystem` only |
| Commands only, no files | `sandbox` only |

`filesystem` and `mounts` are mutually exclusive.

---

## 9. Key Takeaways (Updated)

1. **Use `@mastra/fastembed` for embeddings** — no API key, runs locally, good enough for POC.

2. **LibSQL is all-in-one** — same `@mastra/libsql` package gives us both storage and vector store.

3. **LibSQL index names: no hyphens** — must match `[a-zA-Z_][a-zA-Z0-9_]*`.

4. **LibSQL only supports cosine similarity** — not a problem for our use case.

5. **Include `LIBSQL_PROMPT` in agent instructions** when using the vector query tool.

6. **`vectorStoreName` must match the key in `new Mastra({ vectors: { ... } })`** — string reference.

7. **Working memory can have both scopes simultaneously** — thread + resource on same Memory instance.

8. **Memory sharing between agents is opt-in** — use matching `resource` IDs.

9. **Observational Memory is overkill for us** — short sessions, basic memory is sufficient.

10. **`@mastra/rag` is not installed yet** — need to add it for RAG over past compositions.

11. **Editor is useful post-POC** — lets non-developers iterate on agent instructions through Studio without redeploying. Versioning, A/B testing, prompt blocks with template variables. Not needed for Phase 3.

12. **Workspaces overlap with our Docker sandbox** — both provide filesystem + command execution + skills. But our sandbox runs inside Docker with custom `edit_file` search-and-replace semantics and `get_pending_changes()` diff sync that Workspaces don't support. Keep our Docker sandbox for isolation and custom tool behavior.

13. **Workspace skills could replace our `list_skills`/`load_skill` MCP tools** — if we adopted workspaces. But since we're not, keep the MCP-based skill tools.

14. **Workspace `LocalSandbox` runs commands on the host** — not truly isolated. Our Docker sandbox gives us real isolation. `E2BSandbox` would also work but is a cloud service.
