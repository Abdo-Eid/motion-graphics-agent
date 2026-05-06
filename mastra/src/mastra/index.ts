
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";

import { memory, storage } from "./memory";
import { addAsset, setBrief, setSceneDesign, setStyleContext } from "./memory/access";
import { agentModel } from "./model";

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
    addAsset,
  },
});

export const mastra = new Mastra({
  storage,
  agents: {
    memoryTestAgent,
  },
  tools: {
    setBrief,
    setStyleContext,
    setSceneDesign,
    addAsset,
  },
  memory: {
    workspace: memory,
  },
});
