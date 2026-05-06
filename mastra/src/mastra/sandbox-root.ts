import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Filesystem root shared between the Mastra server (upload handlers, Phase 4
// read-through routes) and the Bun sandbox MCP service. NOT related to
// `@mastra/core/workspace` — see "Terminology" in PROJECT_OVERVIEW.md.
//
// Anchor to this file so the path is independent of CWD.
// - source (bun/tsx):   src/mastra/sandbox-root.ts -> ../../../sandbox/.workspace = <repo>/sandbox/.workspace
// - mastra dev/start:   .mastra/output/index.mjs   -> ../../../sandbox/.workspace = <repo>/sandbox/.workspace
const here = dirname(fileURLToPath(import.meta.url));

export const sandboxRoot = process.env.WORKSPACE_PATH ?? resolve(here, '../../../sandbox/.workspace');
