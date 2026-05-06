import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

import { agentModel } from "../model.ts";
import { WorkspaceStateSchema } from "./schema.ts";

export const storage = new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
});


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
