import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";

import { implementorAgent } from "./agents/implementor";

import { retrieveProjectKnowledge } from "./knowledge/retrieve";
import { memory, storage } from "./memory";
import {
  setBrief,
  setSceneDesign,
  setStyleContext,
} from "./memory/access";
import { agentModel } from "./model";
import { createStudioAttachmentMiddleware } from "./uploads/studio-bridge";
import { uploadRoutes } from "./uploads/router";
import { localWorkspace } from "./workspace-config";

// Throwaway test agent for Studio Playground verification of T1A memory writes
// and T1B knowledge retrieval. Delete once T2 (Planner) and T3 (Art Director)
// land — they are the real consumers. addAsset is intentionally NOT attached:
// per phase-3-memory-and-state.md, addAsset is system-only and never on an agent.
// retrieveProjectKnowledge must NEVER be on the Implementor either.
const t1TestAgent = new Agent({
  id: "t1-test-agent",
  name: "T1 Test Agent",
  instructions: [
    "You are a temporary checkpoint agent for T1A and T1B verification.",
    "Use the matching tool for the requested write; do not invent your own memory updates.",
    "Workspace State writes (setBrief, setStyleContext, setSceneDesign) infer the project AND the caller identity automatically from the current conversation. You never pass a projectId or a role — just supply the field payload (e.g. { brief: { ... } }).",
    "NEVER call updateWorkingMemory directly. It bypasses role checks and will write incorrect data. Every working-memory mutation must go through setBrief / setStyleContext / setSceneDesign — those are the only sanctioned writers.",
    "Before answering questions about uploaded reference material, ALWAYS call retrieveProjectKnowledge first and answer only from the retrieved chunks.",
    "When you cite retrieved knowledge, mention the source filename it came from.",
    "If the user asks you to inspect or create local files, use the mastra_workspace_* tools against the configured workspace.",
    "If a user attached a file in Studio, assume the system has also indexed it into project knowledge — you can answer immediately from the file part, then in follow-up turns rely on retrieveProjectKnowledge to recall it without re-attachment.",
  ].join("\n"),
  model: agentModel(),
  defaultOptions: {
    maxSteps: 15,
  },
  memory,
  tools: {
    setBrief,
    setStyleContext,
    setSceneDesign,
    retrieveProjectKnowledge,
  },
});

export const mastra = new Mastra({
  storage,
  agents: {
    t1TestAgent,
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
