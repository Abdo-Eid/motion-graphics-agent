# MCP Crash Course

A deeper walkthrough of the Model Context Protocol — what it is, how it works, and how to build a small server. Read this before building the sandbox MCP server.

---

## 1. What MCP Is (and Why It Exists)

**MCP (Model Context Protocol)** is an open protocol from Anthropic that standardizes how AI agents talk to external tools, data sources, and services.

Before MCP, every agent framework had its own custom tool format. If you wanted your "file reader" to work with Claude, ChatGPT, and your own agent, you had to write three integrations.

MCP fixes this with a single protocol:

```text
Any MCP client  <──MCP──>  Any MCP server
(Claude Desktop,            (your file tools,
 Cursor, your agent)         GitHub tools, etc.)
```

Write the server once → it works everywhere.

### Mental model

Think of MCP like USB for AI:

- **MCP server** — a peripheral that exposes capabilities (your sandbox)
- **MCP client** — the host that uses them (Mastra / Claude Desktop / Cursor)
- **Protocol** — the standard plug between them

---

## 2. The Three Things an MCP Server Can Expose

| Primitive | What it is | Example |
|---|---|---|
| **Tools** | Functions the agent can call | `read_file(path)`, `run_typecheck()` |
| **Resources** | Data the agent can read | A file, a database row, a doc |
| **Prompts** | Templated prompt snippets | "Summarize this document" |

For your sandbox, **tools** are the main thing. You can ignore prompts entirely. Resources are useful for exposing skill docs but tools alone work for MVP.

### Tools in detail

A tool has:

- a **name** (e.g. `read_file`)
- a **description** (the agent reads this to know when to use it)
- an **input schema** (JSON Schema describing parameters)
- a **handler** (the code that runs when the tool is called)

Example tool definition (TypeScript SDK shape):

```ts
server.tool(
  'read_file',
  'Read the contents of a file from the workspace',
  {
    path: z.string().describe('Path relative to /workspace'),
  },
  async ({ path }) => {
    const content = await fs.readFile(`/workspace/${path}`, 'utf-8')
    return { content: [{ type: 'text', text: content }] }
  }
)
```

The agent sees the name + description + schema and decides when to call it. It cannot see your handler code.

---

## 3. Transports: stdio vs HTTP

MCP supports two transport methods. Pick based on where the server runs.

### stdio (standard input/output)

- Server runs as a subprocess of the client
- Client launches it, talks via stdin/stdout
- Simple, fast, secure
- Best for: local tools running on the same machine as the client

```text
Claude Desktop ──spawn──> npx my-mcp-server
              <──stdio──>
```

### HTTP / SSE (Server-Sent Events)

- Server runs as an HTTP service
- Client connects over the network
- Best for: remote tools, Docker containers, multi-tenant servers

```text
Mastra ──HTTP──> http://localhost:3001 (your sandbox container)
       <──SSE──>
```

**For your project: use HTTP.** Your MCP server lives inside a Docker container, and Mastra (on the host) connects to it over the network. stdio would require the client to spawn the server process, which doesn't work cleanly across the Docker boundary.

---

## 4. Protocol Basics (You Don't Need to Read JSON-RPC)

Under the hood, MCP uses JSON-RPC 2.0. You will almost never write this by hand — the SDK handles it. But knowing the shape helps when debugging.

A tool call looks roughly like:

```json
// client -> server
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "read_file", "arguments": { "path": "hello.txt" } } }

// server -> client
{ "jsonrpc": "2.0", "id": 1,
  "result": { "content": [{ "type": "text", "text": "hi from the host" }] } }
```

The lifecycle is:

1. Client connects → asks "what tools do you have?" (`tools/list`)
2. Server responds with the tool catalog
3. Client (or its agent) decides to call a tool (`tools/call`)
4. Server runs the handler and returns the result

---

## 5. The TypeScript SDK

The official SDK is `@modelcontextprotocol/sdk`. It handles transport, JSON-RPC, schemas, error handling.

```bash
npm install @modelcontextprotocol/sdk zod
```

Minimal HTTP server skeleton:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import express from 'express'

const server = new McpServer({
  name: 'my-sandbox',
  version: '1.0.0',
})

server.tool(
  'echo',
  'Echo a message back',
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: 'text', text: `you said: ${message}` }],
  })
)

const app = express()
const transport = new StreamableHTTPServerTransport({ /* ... */ })
await server.connect(transport)
app.listen(3001)
```

(Exact wiring depends on SDK version — see the SDK README for current syntax.)

---

## 6. MCP Apps — Where You'll See It in the Wild

Here are real apps that use MCP. Trying any of them helps build intuition.

### Clients (use MCP servers)

| App | What it does with MCP |
|---|---|
| **Claude Desktop** | Lets you add MCP servers via config; tools appear in the UI |
| **Cursor** | IDE that can call MCP tools during coding sessions |
| **Windsurf (Codeium)** | IDE with MCP support |
| **Zed** | Editor with MCP integration |
| **Mastra** | Your agent framework — connects to MCP servers and gives the tools to agents |
| **Cline** (VS Code ext) | Agentic coding with MCP tool support |

### Existing servers (catalog)

- **Filesystem** — read/write local files
- **GitHub** — repos, issues, PRs
- **Postgres** — query a database
- **Puppeteer** — browser automation
- **Slack** — send messages, read channels
- **Google Drive** — file access

A community catalog lives at [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers). Reading one or two of those source trees is the fastest way to understand real-world server patterns.

### Try it yourself (recommended)

The single most useful thing you can do before writing your own server: **install Claude Desktop, add the official filesystem MCP server, and watch it work.**

1. Install Claude Desktop
2. Edit the config file (`claude_desktop_config.json`) to add the filesystem server
3. Ask Claude to "list files in this folder"
4. Watch the tool call happen in the UI

This makes the abstraction concrete in 10 minutes.

---

## 7. What to Read

In this order, lightest to heaviest:

1. **[modelcontextprotocol.io](https://modelcontextprotocol.io)** — the official intro. Read "Introduction" and "Core Concepts" pages.
2. **[Quickstart: Build a server](https://modelcontextprotocol.io/quickstart/server)** — official tutorial. Walks through a real server end to end.
3. **[TypeScript SDK README](https://github.com/modelcontextprotocol/typescript-sdk)** — code-level reference for the API you'll use.
4. **[Example servers source](https://github.com/modelcontextprotocol/servers)** — read the `filesystem` server source. It's small and does exactly what you need to do.
5. **[MCP spec](https://spec.modelcontextprotocol.io)** — only when something specific stops making sense. Don't read top-to-bottom.

Skip the deep protocol spec for now. The SDK abstracts it away.

---

## 8. Common Gotchas

- **Tool descriptions matter a lot.** The agent decides when to call your tool based on the description. Vague descriptions = unused tools. Write them as if explaining to a junior dev who has never seen your codebase.
- **Schemas are guardrails.** A clear input schema prevents the agent from passing junk. Use Zod with `.describe()` on every field.
- **Errors should return a result, not throw.** Throwing breaks the connection. Return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` instead.
- **Tools should be idempotent when possible.** Agents retry. A tool that can be called twice without side effects is safer.
- **Don't expose dangerous operations.** Anything that can run arbitrary shell commands is a footgun. Be specific (`run_typecheck`) not general (`run_command`).
- **Keep tools focused.** One tool per capability. Don't make a `do_everything` tool with mode flags.

---

## Practice Exercise — Build a Tiny MCP Server

Goal: build an MCP server that exposes two tools (`read_file` and `list_files`), connect to it from Claude Desktop or MCP Inspector, and watch a real LLM call your tools.

This uses tools, schemas, descriptions, transport, and the full request/response lifecycle.

### Setup

```text
mini-mcp/
├── package.json
├── server.ts
└── workspace/
    ├── hello.txt   ("hello from MCP")
    └── notes.md    ("# my notes\n\nsome text")
```

### `package.json`

```json
{
  "name": "mini-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

### `server.ts` (stdio transport — easiest for first run)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'

const WORKSPACE = path.resolve('./workspace')

const server = new McpServer({
  name: 'mini-mcp',
  version: '1.0.0',
})

server.tool(
  'list_files',
  'List all files in the workspace directory',
  {},
  async () => {
    const files = await fs.readdir(WORKSPACE)
    return {
      content: [{ type: 'text', text: files.join('\n') }],
    }
  }
)

server.tool(
  'read_file',
  'Read the contents of a file by name from the workspace',
  {
    name: z.string().describe('File name relative to the workspace root'),
  },
  async ({ name }) => {
    const safe = path.join(WORKSPACE, name)
    if (!safe.startsWith(WORKSPACE)) {
      return {
        content: [{ type: 'text', text: 'Error: path escapes workspace' }],
        isError: true,
      }
    }
    const content = await fs.readFile(safe, 'utf-8')
    return { content: [{ type: 'text', text: content }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

### Run and test

**Option A — MCP Inspector (recommended first):**

The official Inspector is a UI for testing MCP servers without an LLM.

```bash
npx @modelcontextprotocol/inspector tsx server.ts
```

This launches a local UI in your browser. You can:
- See your tool catalog
- Call tools manually
- Watch real JSON-RPC messages
- Iterate without an LLM in the loop

**Option B — Claude Desktop:**

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mini-mcp": {
      "command": "tsx",
      "args": ["C:/path/to/mini-mcp/server.ts"]
    }
  }
}
```

Restart Claude Desktop. Ask: *"What files are in my workspace? Read hello.txt for me."* Watch Claude call your tools.

### What this exercise proves

- You can define tools with names, descriptions, and schemas
- You understand how a client discovers tools (`tools/list`)
- You understand how a client calls tools (`tools/call`)
- You've used both the Inspector (debugging) and a real client (Claude Desktop)
- You handled an error case safely
- You used path safety so the tool can't escape its workspace

This is the same shape as the real sandbox MCP server. The differences for the sandbox version:

1. Switch transport from stdio → HTTP
2. Add the rest of the tools (`edit_file`, `create_file`, `grep`, skills, verify)
3. Run inside a Docker container

---

## Next After This

When this exercise feels easy:

1. **Convert your stdio server to HTTP transport** so it can run as a network service
2. **Wrap it in Docker** (you already know how — combine this with the Docker crash course)
3. **Add file-write tools** (`edit_file`, `create_file`) with proper sandboxing
4. **Connect from Mastra** instead of Claude Desktop

See `docs/Building a Local Docker Sandbox for Agentic Apps.md` for the full sandbox design and the exact tool list you need to implement.
