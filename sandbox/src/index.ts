// Sandbox service entrypoint.
//
// Boots a Mastra MCP server over HTTP that exposes file and command-execution
// tools to the Implementor agent. The main app at `mastra/` connects to this
// service via MCPClient.
//
// This file is a placeholder. Implementation is tracked in
// `tasks/phase-3-sandbox-service.md`. See `docs/local-sandbox-service-design.md`
// for architecture and tool surface.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Anchor to this file so the workspace path is independent of CWD.
// - source (bun/tsx):   src/index.ts -> ../.workspace = <repo>/sandbox/.workspace
// - compiled service:   keep WORKSPACE_PATH set if output is moved elsewhere
const here = dirname(fileURLToPath(import.meta.url))

const port = Number(process.env.SANDBOX_HTTP_PORT ?? 4311)
const workspaceDir = process.env.WORKSPACE_PATH ?? resolve(here, '../.workspace')

console.log(`[sandbox] starting on port ${port}`)
console.log(`[sandbox] workspace dir: ${workspaceDir}`)
console.log('[sandbox] not yet implemented — see tasks/phase-3-sandbox-service.md')
