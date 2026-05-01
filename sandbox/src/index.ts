// Sandbox service entrypoint.
//
// Boots a Mastra MCP server over HTTP that exposes file and command-execution
// tools to the Implementor agent. The main app at `mastra/` connects to this
// service via MCPClient.
//
// This file is a placeholder. Implementation is tracked in
// `tasks/phase-3-sandbox-service.md`. See `docs/local-sandbox-service-design.md`
// for architecture and tool surface.

const port = Number(process.env.SANDBOX_HTTP_PORT ?? 4311)
const workspaceDir = process.env.SANDBOX_WORKSPACE_DIR ?? './.workspace'

console.log(`[sandbox] starting on port ${port}`)
console.log(`[sandbox] workspace dir: ${workspaceDir}`)
console.log('[sandbox] not yet implemented — see tasks/phase-3-sandbox-service.md')
