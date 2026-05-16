/**
 * Canonical Mastra Workspace configuration.
 *
 * This owns the local filesystem/sandbox used for uploads, generated project
 * files, and direct Workspace tools. Only the Implementor should receive these
 * tools; Planner and Art Director must not get filesystem or command access.
 */
import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
} from '@mastra/core/workspace';

import { workspaceRoot } from './workspace-root';

export const localWorkspace = new Workspace({
  id: 'local-dev-workspace',
  name: 'Local Dev Workspace',
  filesystem: new LocalFilesystem({ basePath: workspaceRoot }),
  sandbox: new LocalSandbox({ workingDirectory: workspaceRoot }),
  // Keep BM25 on; vector search would need a MastraVector + Embedder shim and
  // would shadow our project Knowledge Store, which lives elsewhere on purpose.
  bm25: true,
  skills: ['skills'],
});
