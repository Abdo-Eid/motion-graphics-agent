import { Mastra } from "@mastra/core/mastra";

import { artDirectorAgent } from "./agents/art-director";
import { implementorAgent } from "./agents/implementor";
import { plannerAgent } from "./agents/planner";
import { memory, storage } from "./memory";
import { eventRoutes } from "./server/event-routes";
import { workspaceRoutes } from "./server/workspace-routes";
import { startWorkspaceWatcher } from "./server/workspace-watch";
import { uploadRoutes } from "./uploads/router";
import { createStudioAttachmentMiddleware } from "./uploads/studio-bridge";

void startWorkspaceWatcher().catch(error => {
  console.error('Workspace watcher failed to start', error);
});

export const mastra = new Mastra({
  storage,
  agents: {
    plannerAgent,
    artDirectorAgent,
    implementorAgent,
  },
  // Mastra memory registry. The key "workspace" here is a Mastra registry
  // identifier (consumed by `mastra.getMemory("workspace")` and the Studio
  // Memory tab) — it is NOT `@mastra/core/workspace`. See "Terminology" in
  // PROJECT_OVERVIEW.md.
  memory: {
    workspace: memory,
  },
  server: {
    apiRoutes: [
      ...uploadRoutes,
      ...workspaceRoutes,
      ...eventRoutes,
    ],
    middleware: [
      {
        // Intercepts Studio Playground attachment uploads on the agent
        // stream endpoint and pushes them through ingestUpload() so they
        // land in the Knowledge Store. Pass-through; never mutates the body.
        path: "/api/agents/*/stream",
        handler: createStudioAttachmentMiddleware(),
      },
      {
        path: "/api/agents/*/streamVNext",
        handler: createStudioAttachmentMiddleware(),
      },
    ],
  },
});
