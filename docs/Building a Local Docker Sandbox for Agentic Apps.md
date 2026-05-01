# Building a Local Docker Sandbox for Agentic Apps

> **One-line summary:** How to build a local Docker-based sandbox to run agent-generated code — a simple, project-agnostic recipe with a worked example for the editing agent project. The sandbox runs an MCP server inside; the host connects as an MCP client. No shared filesystems.
> 

---

# Why Roll Your Own Sandbox

Remote sandbox services (E2B, Novita AI, Daytona, Northflank, Modal) are great when you need to scale to many concurrent users, need microVM-grade isolation, or don't want to maintain infrastructure. For a local POC or demo on your own laptop, they come with tradeoffs:

- **Cost** — pay per sandbox-hour, even when idle
- **Latency** — every tool call hits the network
- **Offline** — no wifi, no sandbox
- **Debugging** — can't just `docker exec` into it
- **Lock-in** — tool implementations tied to a vendor SDK

A local Docker sandbox is free, fast, works offline, and is easy to debug. The tradeoff is you build the isolation layer yourself — but for a laptop-scale app, it's a one-afternoon project.

The tool *signatures* below follow mainstream conventions used by Claude Code, OpenCode, and Codex. The agent prompts and patterns you build transfer cleanly to those tools if you ever want to — but you're committing to Docker as the backend here.

---

# Core Concepts

A sandbox boils down to four primitives:

| Primitive | What it does | How it's implemented here |
| --- | --- | --- |
| **Filesystem** | A scratch workspace the agent can read and write | A tmpfs mount inside the container, not shared with host |
| **Isolation** | Keeping the environment from harming the host | Resource limits, network policies, read-only FS, MCP-only API boundary |

Everything else is a thin wrapper around these.

---

# Architecture

The sandbox is fully isolated. Your host app and the sandbox communicate **only through MCP** — same protocol, same boundary, whether running on [localhost](http://localhost) or remote.

```jsx
┌──────────────────────────────────────────┐
│  Host App (your machine)                 │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Vite + React frontend              │  │
│  │  - Chat UI                         │  │
│  │  - Remotion Player (live preview)  │  │
│  │  - ./preview/  ← local .tsx copies │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ Mastra agents + MCP client         │  │
│  └────────────────┬───────────────────┘  │
└────────────────────┼─────────────────────┘
                     │ MCP over HTTP
                     │ (localhost:3001)
┌────────────────────▼─────────────────────┐
│  Docker container (the sandbox)          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ MCP server (exposes tools)         │  │
│  │  - read_file, edit_file, create,   │  │
│  │    grep, exec_command, exec_bg, …  │  │
│  │  - get_pending_changes (for sync)  │  │
│  └────────────────┬───────────────────┘  │
│                   │                      │
│  ┌────────────────▼───────────────────┐  │
│  │ /workspace (tmpfs, isolated)       │  │
│  │ Pre-installed: Node, Remotion,     │  │
│  │ TypeScript, /.skills/              │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**The flow:**

1. User starts a session → host spins up the container from the template image on port `3001`
2. Container boots; MCP server inside starts listening on `3001`
3. Host's MCP client connects to `localhost:3001`
4. Agents call tools → MCP client → MCP server in container → executes inside sandbox → result back
5. For preview: after each agent turn, host pulls accumulated file diffs via MCP and applies them to its local `./preview/` directory; Remotion Player hot-reloads

**Why this is the right architecture:**

- The sandbox is a **black box** — the host has zero direct filesystem or process access
- One protocol (MCP) for everything — no special-case bind mounts or shared volumes
- Same code works if you ever swap local Docker for a remote sandbox host
- Matches how real systems (E2B, llm-sandbox) work

---

# Step-by-Step

## Step 1 — The Docker Image

The image has everything pre-installed: Node, the runtime deps, the skill markdown files, and the MCP server itself.

```docker
FROM node:22-slim

# Runtime utilities the agent might need
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep git \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 agent
USER agent
WORKDIR /workspace

# Skills bundled into the image (list_skills reads from here)
COPY --chown=agent:agent skills/ /.skills/

# The MCP server itself
COPY --chown=agent:agent mcp-server/ /home/agent/mcp-server/
RUN cd /home/agent/mcp-server && npm install --omit=dev

# Container's main process IS the MCP server.
# As long as the server is running, the container is alive.
EXPOSE 3001
CMD ["node", "/home/agent/mcp-server/index.js"]
```

Build once:

```bash
docker build -t my-agent-sandbox ./sandbox
```

## Step 2 — The MCP Server (runs inside the container)

The MCP server is the **only thing** the host can talk to. It exposes the tools (`read_file`, `edit_file`, `exec`, etc.) over HTTP.

### Full Tool List

| Tool | Purpose | Built on |
|---|---|---|
| `read_file` | Read a file from workspace | — |
| `edit_file` | Patch-edit a file (search/replace) | — |
| `create_file` | Create a new file | — |
| `list_files` | List directory contents | — |
| `grep` | Search file contents | — |
| `list_skills` | List available skill docs | — |
| `load_skill` | Load a skill's SKILL.md | — |
| `run_typecheck` | Run typecheck on workspace | `exec_command` |
| `run_render_check` | Run quick render validation | `exec_command` |
| `exec_command` | Run shell command (blocking) | — |
| `start_process` | Start a long-running command | — |
| `get_process_output` | Poll process output and status | — |
| `kill_process` | Stop a running process | — |

13 tools total. 4 real execution implementations (`exec_command`, `start_process`, `get_process_output`, `kill_process`). `run_typecheck` and `run_render_check` are convenience wrappers so the agent gets clear named tools for common operations.

```tsx
// sandbox/mcp-server/index.ts — runs INSIDE the container
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import * as fs from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'

const exec = promisify(execFile)
const WORKSPACE = '/workspace'

// Track every edit so the host can pull them later for preview sync
interface Patch {
  path: string
  op: 'create' | 'replace' | 'delete'
  old_string?: string
  new_string?: string
  replace_all?: boolean
  content?: string
}
const pendingChanges: Patch[] = []

const server = new McpServer({ name: 'sandbox', version: '1.0.0' })

server.tool(
  'read_file',
  { path: z.string(), offset: z.number().optional(), limit: z.number().optional() },
  async ({ path, offset, limit }) => {
    const content = await fs.readFile(`${WORKSPACE}/${path}`, 'utf-8')
    if (offset === undefined) return { content: [{ type: 'text', text: content }] }
    const lines = content.split('\n')
    const start = offset - 1
    const end = limit ? start + limit : lines.length
    return { content: [{ type: 'text', text: lines.slice(start, end).join('\n') }] }
  },
)

server.tool(
  'edit_file',
  {
    path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  },
  async ({ path, old_string, new_string, replace_all }) => {
    const filePath = `${WORKSPACE}/${path}`
    const current = await fs.readFile(filePath, 'utf-8')
    if (!current.includes(old_string)) throw new Error('old_string not found')
    const occurrences = current.split(old_string).length - 1
    if (occurrences > 1 && !replace_all) {
      throw new Error(`old_string matches ${occurrences} times; add more context or set replace_all=true`)
    }
    const updated = replace_all
      ? current.split(old_string).join(new_string)
      : current.replace(old_string, new_string)
    await fs.writeFile(filePath, updated)
    pendingChanges.push({ path, op: 'replace', old_string, new_string, replace_all })
    return { content: [{ type: 'text', text: 'ok' }] }
  },
)

server.tool('create_file', { path: z.string(), content: z.string() }, async ({ path, content }) => {
  await fs.writeFile(`${WORKSPACE}/${path}`, content)
  pendingChanges.push({ path, op: 'create', content })
  return { content: [{ type: 'text', text: 'ok' }] }
})

server.tool('exec_command',
  { command: z.string(), args: z.array(z.string()).optional() },
  async ({ command, args = [] }) => {
    const { stdout, stderr } = await exec(command, args, { cwd: WORKSPACE }).catch((e) => ({
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message,
    }))
    return { content: [{ type: 'text', text: JSON.stringify({ stdout, stderr }) }] }
  },
)

// Background process tracking
const backgroundProcesses = new Map<string, { child: any; stdout: string[]; stderr: string[] }>()
let nextPid = 1

server.tool('start_process',
  { command: z.string(), args: z.array(z.string()).optional() },
  async ({ command, args = [] }) => {
    const pid = String(nextPid++)
    const child = spawn(command, args, { cwd: WORKSPACE })
    const stdout: string[] = []
    const stderr: string[] = []
    child.stdout?.on('data', (d) => stdout.push(d.toString()))
    child.stderr?.on('data', (d) => stderr.push(d.toString()))
    child.on('close', () => backgroundProcesses.delete(pid))
    backgroundProcesses.set(pid, { child, stdout, stderr })
    return { content: [{ type: 'text', text: JSON.stringify({ pid, status: 'running' }) }] }
  },
)

server.tool('get_process_output',
  { pid: z.string() },
  async ({ pid }) => {
    const proc = backgroundProcesses.get(pid)
    if (!proc) return { content: [{ type: 'text', text: JSON.stringify({ error: 'process not found' }) }], isError: true }
    const exitCode = proc.child.exitCode
    return {
      content: [{ type: 'text', text: JSON.stringify({
        pid,
        status: exitCode === null ? 'running' : 'done',
        exitCode,
        stdout: proc.stdout.join(''),
        stderr: proc.stderr.join(''),
      }) }],
    }
  },
)

server.tool('kill_process',
  { pid: z.string() },
  async ({ pid }) => {
    const proc = backgroundProcesses.get(pid)
    if (!proc) return { content: [{ type: 'text', text: JSON.stringify({ error: 'process not found' }) }], isError: true }
    proc.child.kill()
    backgroundProcesses.delete(pid)
    return { content: [{ type: 'text', text: JSON.stringify({ pid, status: 'killed' }) }] }
  },
)

// Called by the host after each agent turn to pull accumulated file changes
server.tool('get_pending_changes', {}, async () => {
  const changes = [...pendingChanges]
  pendingChanges.length = 0
  return { content: [{ type: 'text', text: JSON.stringify(changes) }] }
})

// ... list_files, grep, list_skills, load_skill

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
})
await server.connect(transport)

const httpServer = createServer(/* ... wire transport.handleRequest ... */)
httpServer.listen(3001, '0.0.0.0')
```

## Step 3 — The Host's Sandbox Session

On the host, `dockerode` is used **only** to launch and stop the container. All actual work goes through MCP.

```tsx
// src/sandbox/sandbox-session.ts — runs on the HOST
import Docker from 'dockerode'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export class SandboxSession {
  private docker = new Docker()
  private container?: Docker.Container
  public mcpClient?: Client

  constructor(private port = 3001, private image = 'my-agent-sandbox') {}

  async start() {
    this.container = await this.docker.createContainer({
      Image: this.image,
      ExposedPorts: { '3001/tcp': {} },
      HostConfig: {
        PortBindings: { '3001/tcp': [{ HostPort: String(this.port) }] },
        // Resource limits
        Memory: 2 * 1024 * 1024 * 1024,
        NanoCpus: 2_000_000_000,
        PidsLimit: 256,
        // Isolation — NO bind mount
        Tmpfs: { '/workspace': 'size=1g', '/tmp': 'size=64m' },
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        AutoRemove: true,
        NetworkMode: 'bridge', // needed so host can reach the port
      },
    })
    await this.container.start()

    // Wait for MCP server inside to be ready
    await waitForPort(this.port)

    this.mcpClient = new Client({ name: 'host', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${this.port}/mcp`),
    )
    await this.mcpClient.connect(transport)
  }

  async stop() {
    await this.mcpClient?.close()
    await this.container?.stop({ t: 2 }).catch(() => {})
  }
}
```

The agent calls `mcpClient.callTool('read_file', { path: '...' })`. No `dockerode` calls from the agent itself — it speaks MCP, period.

---

# Isolation Checklist

The Docker defaults are permissive. For sandboxed LLM code, lock things down:

| Setting | Value | Why |
| --- | --- | --- |
| `ReadonlyRootfs` | `true` | Filesystem is read-only except tmpfs mounts |
| `NanoCpus` | `2e9` (= 2 CPUs) | Prevents CPU bombs |
| `CapDrop` | `["ALL"]` | Drop all Linux capabilities unless one is specifically needed |
| Non-root user | UID 1001 in Dockerfile | Even if breakout happens, attacker is unprivileged |
| `AutoRemove` | `true` | Containers clean themselves up on stop |

Docker alone is not a hard security boundary (shared kernel with host). For genuinely untrusted code in production, add gVisor (`runsc`) or Kata Containers as the runtime. For a local demo, the defaults above are sufficient.

---

# Wiring Tools into the Agent

Mastra supports MCP clients natively — you don't manually wrap each tool. Point Mastra at the MCP client and it auto-discovers everything the server exposes.

```tsx
// src/agents/implementor-agent.ts
import { Agent } from '@mastra/core/agent'
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    sandbox: { url: new URL('http://localhost:3001/mcp') },
  },
})

const tools = await mcp.getTools()

export const implementorAgent = new Agent({
  name: 'implementor',
  instructions: 'You write Remotion TypeScript files based on Art Director scene designs and shared style context...',
  model: openai('gpt-4o'),
  tools, // all sandbox tools auto-imported via MCP
})
```

The agent has no idea Docker exists. It only sees MCP tools. Swap `localhost:3001` for a remote URL and nothing changes.

**Sessions are per-user.** Each user session spins up its own container on its own port. This keeps users from touching each other's workspaces.

---

# MCP at the Agent Layer, SDK at the Docker Layer

The MCP server is the agent-facing boundary. Underneath, it uses an **SDK** (or the Docker CLI through `dockerode`) to actually control the container — start it, stop it, exec commands, manage processes, and read/write files.

```text
Agent -> MCP tools (read_file, execute_command, ...)
            -> MCP server inside the container
                -> Docker SDK / dockerode / shell -> /workspace
```

So MCP is the protocol the agent speaks. The SDK is how the sandbox is actually driven. The same shape applies if Docker is later replaced by a hosted provider:

```text
Agent -> same MCP tools
            -> MCP server
                -> E2B SDK / Daytona SDK / provider API
```

# Bonus: MCP-compatible from Day 1

Because the sandbox already exposes MCP, **any** MCP-compatible client can use it — Claude Desktop, Cursor, VS Code agent mode, OpenCode, all of them. Drop the URL into their config and the sandbox becomes a usable tool. MCP is an open protocol, not a Mastra-only feature, so this sandbox is not locked to one agent framework.

---

# Applying This to the Editing Agent

In this project, the sandbox serves the Planner -> Art Director -> Implementor architecture. The Implementor is the MCP tool user; Planner and Art Director stay tool-free. The editing agent is a specialization of the generic sandbox: Remotion + TypeScript + a few extra tools, plus live preview via diff sync.

## Dockerfile

```docker
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep git \
    # Remotion rendering needs Chromium
    chromium \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 agent
USER agent
WORKDIR /workspace

# Pre-install the Remotion scaffold's runtime deps.
# Lives separate from /workspace so the agent never modifies them.
COPY --chown=agent:agent package.json /home/agent/deps/
RUN cd /home/agent/deps && npm install --omit=dev
ENV NODE_PATH=/home/agent/deps/node_modules

# Skills + MCP server baked in
COPY --chown=agent:agent skills/ /.skills/
COPY --chown=agent:agent mcp-server/ /home/agent/mcp-server/
RUN cd /home/agent/mcp-server && npm install --omit=dev

EXPOSE 3001
CMD ["node", "/home/agent/mcp-server/index.js"]
```

## Editing-Agent-Specific Tools

These live inside the MCP server, alongside the generic ones:

```tsx
// Convenience wrappers built on exec_command
server.tool('run_typecheck', {}, async () => {
  const { stdout, stderr } = await exec('npx', ['tsc', '--noEmit'], { cwd: WORKSPACE })
    .catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '' }))
  return { content: [{ type: 'text', text: parseTypeScriptErrors(stdout + stderr) }] }
})

server.tool('run_render_check', {}, async () => {
  const result = await exec(
    'npx',
    ['remotion', 'render', '--frames=0-2', '--output=/tmp/check.mp4'],
    { cwd: WORKSPACE },
  ).catch((e) => ({ stdout: e.stdout, stderr: e.stderr, code: e.code }))
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: result.code === 0, errors: result.stderr }) }],
  }
})

server.tool('list_skills', {}, async () => {
  const files = await fs.readdir('/.skills')
  return { content: [{ type: 'text', text: JSON.stringify(files.filter(f => f.endsWith('.md'))) }] }
})

server.tool('load_skill', { name: z.string() }, async ({ name }) => {
  const content = await fs.readFile(`/.skills/${name}.md`, 'utf-8')
  return { content: [{ type: 'text', text: content }] }
})
```

## Live Preview — Diff-Based Sync of .tsx Files

### Why this works at all

Remotion Player is a React component running in the browser on the host. It imports `.tsx` composition files and renders them live using the browser's JavaScript engine. The files themselves are tiny — **2–10 KB of text** that describe hundreds of MB of video output. Streaming the text is orders of magnitude cheaper than streaming rendered video.

So the question isn't "how do we stream video from the sandbox to the host?" — it's "how do we get the latest `.tsx` source files onto the host's disk so the Player can import them?"

### The chosen approach: diff-based sync, triggered by agent turns

Instead of re-fetching whole files every time, or polling on a timer, we sync **only the changes** and only when the agent is done editing.

**How it works:**

1. The MCP server inside the sandbox tracks every `edit_file` / `create_file` call and appends a patch to `pendingChanges`
2. When the agent finishes its turn, the host calls `get_pending_changes` via MCP
3. The sandbox returns the accumulated patches — `{ path, op, old_string, new_string }` records, not full file contents — and clears its buffer
4. The host applies those patches to its local `./preview/` directory on disk
5. Vite's file watcher sees the disk change and Remotion Player hot-reloads

### Why diffs instead of full files

| Approach | Per-edit payload | Notes |
| --- | --- | --- |
| Diff sync | ~0.1–0.5 KB | Only the touched lines travel over MCP |

For a single file the difference is trivial. But an agent turn that touches five files across a 500-line composition becomes measurably snappier with diffs — and since `edit_file` already operates on search-and-replace pairs, recording them for sync is essentially free.

### Host-side sync code

```tsx
// On the host, after each agent turn finishes:
const result = await mcpClient.callTool('get_pending_changes', {})
const changes: Patch[] = JSON.parse(result.content[0].text)

for (const patch of changes) {
  const localPath = `./preview/${patch.path}`
  if (patch.op === 'create') {
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, patch.content!)
  } else if (patch.op === 'replace') {
    const current = await fs.readFile(localPath, 'utf-8')
    const updated = patch.replace_all
      ? current.split(patch.old_string!).join(patch.new_string!)
      : current.replace(patch.old_string!, patch.new_string!)
    await fs.writeFile(localPath, updated)
  } else if (patch.op === 'delete') {
    await fs.unlink(localPath).catch(() => {})
  }
}
// Vite picks up the disk changes; Remotion Player hot-reloads automatically
```

### What this gives us

- **Minimal data transfer** — only the touched regions travel over MCP
- **Event-driven, not polled** — sync runs once per agent turn, not on a timer
- **Clean isolation preserved** — MCP is still the only boundary between host and sandbox
- **Natural alignment with the edit tool** — the sandbox already thinks in search-and-replace patches, so recording them for sync comes for free

## Session Lifecycle

```jsx
User starts new video session
  → host spins up container from editing-agent-sandbox image on port 3001 (or 3002, 3003...)
  → MCP server inside boots, starts listening
  → host's MCP client connects
  → Mastra agents get the auto-discovered toolset
  → host seeds the sandbox with the base scaffold (via create_file calls)
  → host creates ./preview/ on its own disk with the same scaffold
  → user chats, agents call tools, sandbox records patches
  → after each agent turn: host pulls patches → applies to ./preview/ → Player hot-reloads
  → user ends session → mcpClient.close() + container.stop()
  → container auto-removes; tmpfs contents vanish
  → ./preview/ optionally persisted to Supabase for later resume
```

---

# Open Source Projects to Look At

Reference implementations worth reading before rolling your own:

- [**typper-io/ai-code-sandbox**](https://github.com/typper-io/ai-code-sandbox) — Simpler Python library. Good reference for resource limits and minimal Dockerfile.
- [**cohere-ai/cohere-terrarium**](https://github.com/cohere-ai/cohere-terrarium) — Cohere's simple Python sandbox (~900ms to run matplotlib).
- [**Node.js Sandbox MCP Server**](https://hub.docker.com/mcp/server/node-code-sandbox/tools) — Official Docker MCP server that runs disposable JS sandboxes. Closest to our stack.
- [**siawkz/llm-sandbox**](https://github.com/siawkz/llm-sandbox) — Docker-based sandbox specifically for CLI coding agents (Claude Code, etc.). Has DNS-based network allowlisting.
- [**vndee/llm-sandbox**](https://github.com/vndee/llm-sandbox) — Python library, but the design is exactly this: Docker/Kubernetes/Podman backends, container pooling, built-in MCP server.
- [**agent-infra/sandbox**](https://github.com/agent-infra/sandbox) — All-in-one Docker image with browser, shell, file, MCP, and VS Code server baked in. Heavy but shows how a "batteries included" sandbox looks.
- [**DifySandbox**](https://github.com/langgenius/dify-sandbox) — Uses seccomp filters to run code in a single container rather than one-container-per-session. Interesting approach if you care about startup latency.
- [**Docker Sandboxes (`sbx`)**](https://docs.docker.com/ai/sandboxes/) — Docker's official (experimental) microVM sandbox CLI for coding agents.
- [**apocas/dockerode**](https://github.com/apocas/dockerode) — the Node.js Docker API client you'll actually use.
- [**restyler/awesome-sandbox**](https://github.com/restyler/awesome-sandbox) — Curated list of all sandbox projects.

For a Node/TypeScript project like the editing agent, the ecosystem is thinner — most of these are Python-first. Porting the core idea to Node with `dockerode` is a few hundred lines.
