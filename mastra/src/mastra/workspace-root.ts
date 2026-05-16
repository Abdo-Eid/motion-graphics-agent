import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Filesystem root shared by uploads, generated files, preview routes, and
// Mastra Workspace tools. Anchor to this file so the path is independent of CWD.
// - source (bun/tsx): src/mastra/workspace-root.ts -> ../../.workspace = <repo>/mastra/.workspace
// - mastra dev/start: .mastra/output/index.mjs -> ../../.workspace = <repo>/mastra/.workspace
const here = dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = process.env.WORKSPACE_PATH ?? resolve(here, '../../.workspace');
