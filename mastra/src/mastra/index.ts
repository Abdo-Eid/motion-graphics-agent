import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { retrieveProjectKnowledge } from "./knowledge/retrieve";
import { memory, storage } from "./memory";
import { setBrief, setSceneDesign, setStyleContext } from "./memory/access";
import { agentModel } from "./model";
import { uploadRoutes } from "./uploads/router";
// Throwaway test agent for Studio Playground verification of T1A memory writes.
// Delete once T2 (Planner) lands. addAsset is intentionally NOT attached: per
// phase-3-memory-and-state.md, addAsset is system-only and never on an agent;
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
// Throwaway test agent for Studio Playground verification of T1B retrieval.
// Delete once T2 (Planner) and T3 (Art Director) land — they are the real
// consumers of retrieveProjectKnowledge. Implementor must NEVER get this tool.
const t1bRetrievalTestAgent = new Agent({
  id: "t1b-retrieval-test",
  name: "T1B Retrieval Test",
  instructions: [
    "You are a temporary checkpoint agent for T1B Knowledge Store verification.",
    "Always call retrieveProjectKnowledge before answering.",
    "Retrieve knowledge from the current project thread before answering.",
    "Answer only from retrieved project knowledge chunks.",
    "Mention the source filenames you used.",
  ].join("\n"),
  model: agentModel(),
  tools: {
    retrieveProjectKnowledge,
  },
});
export const mastra = new Mastra({
  storage,
  agents: {
    memoryTestAgent,
    t1bRetrievalTestAgent,
  },
  memory: {
    workspace: memory,
  },
  server: {
    apiRoutes: uploadRoutes,
  },
});