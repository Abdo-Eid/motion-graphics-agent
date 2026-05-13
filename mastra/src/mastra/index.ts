import { Mastra } from "@mastra/core/mastra";

import { artDirectorAgent } from "./agents/art-director";
import { implementorAgent } from "./agents/implementor";
import { plannerAgent } from "./agents/planner";
import { memory, storage } from "./memory";
import { uploadRoutes } from "./uploads/router";
import { createStudioAttachmentMiddleware } from "./uploads/studio-bridge";
import { localWorkspace } from "./workspace-config";

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
  // Real `@mastra/core/workspace` Workspace — exposes `mastra_workspace_*`
  // file/sandbox/search tools to every agent for Studio testing. Local-only,
  // dev-only; the durable sandbox boundary is still the Bun MCP service
  // described in docs/local-sandbox-service-design.md.
  workspace: localWorkspace,
  server: {
    apiRoutes: uploadRoutes,
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
