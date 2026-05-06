/**
 * Mastra Workspace (LOCAL, DEV ONLY).
 *
 * This is `@mastra/core/workspace` — file/sandbox tools the agent can use
 * inside Studio (read_file, write_file, list, exec, search, index, etc.).
 *
 * It is NOT the long-term sandbox. AGENTS.md / docs/local-sandbox-service-design.md
 * still call for a separate Bun MCP service that owns Implementor execution.
 * This local Workspace exists so the T1 test agent has working filesystem
 * tools in Studio without standing up the MCP service.
 *
 * Reuses the existing sandbox root (sandbox/.workspace) via `sandboxRoot`
 * so any files created here are visible to whatever else points at that
 * directory.
 */
import {
  LocalFilesystem,
  LocalSandbox,
  WORKSPACE_TOOLS,
  Workspace,
} from '@mastra/core/workspace';

import { sandboxRoot } from './sandbox-root';

export const localWorkspace = new Workspace({
  id: 'local-dev-workspace',
  name: 'Local Dev Workspace',
  filesystem: new LocalFilesystem({ basePath: sandboxRoot }),
  sandbox: new LocalSandbox({ workingDirectory: sandboxRoot }),
  // Keep BM25 on; vector search would need a MastraVector + Embedder shim and
  // would shadow our project Knowledge Store, which lives elsewhere on purpose.
  bm25: true,
  tools: {
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      enabled: true,
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      enabled: false,
    },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      enabled: true,
      requireApproval: false,
    },
  },
});
