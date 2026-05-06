
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";

import { memory, storage } from "./memory";
import { setBrief, setSceneDesign, setStyleContext } from "./memory/access";
import { agentModel } from "./model";

// Throwaway test agent for Studio Playground verification of T1A memory writes.
// Delete once T2 (Planner) lands. addAsset is intentionally NOT attached: per
// phase-3-memory-and-state.md:104, addAsset is system-only and never on an agent;
// upload handlers in T1B import it directly.
const memoryTestAgent = new Agent({
  id: "memory-test-agent",
  name: "Memory Test Agent",
  instructions:
    "Use the provided tools to help verify Workspace State writes. Only use the matching tool for the requested field update and do not invent your own memory updates.",
  model: agentModel(),
  memory,
  tools: {
    setBrief,
    setStyleContext,
    setSceneDesign,
  },
});

export const mastra = new Mastra({
  storage,
  agents: {
    memoryTestAgent,
  },
  memory: {
    workspace: memory,
  },
});
