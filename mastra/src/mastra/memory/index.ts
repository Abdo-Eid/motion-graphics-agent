import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

import { agentModel } from "../model.ts";
import { requireEnv } from "../utils/env.ts";
import { WorkspaceStateSchema } from "./schema.ts";

export const storage = new LibSQLStore({
    id: "motion-graphics-agent-storage",
    url: requireEnv("LIBSQL_URL"),
});

/**
 * T1A identity rule: threadId === projectId === resourceId.
 */
export const memory = new Memory({
    storage,
    options: {
        workingMemory: {
            enabled: true,
            schema: WorkspaceStateSchema,
            scope: "thread",
        },
        observationalMemory: {
            model: agentModel(),
            scope: "thread",
        },
    },
});
