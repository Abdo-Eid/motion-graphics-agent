import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { memory } from "./index.ts";
import {
    AssetSchema,
    BriefSchema,
    StyleContextSchema,
    WorkspaceStateSchema,
} from "./schema.ts";

const Role = z.enum(["planner", "artDirector", "implementor", "system"]);

const SetBriefInput = z.object({
    projectId: z.string(),
    role: Role,
    brief: BriefSchema,
});

const SetBriefOutput = z.object({
    projectId: z.string(),
    brief: BriefSchema,
});

async function ensureThread(projectId: string) {
    const existingThread = await memory.getThreadById({ threadId: projectId });

    if (existingThread) {
        return;
    }

    try {
        await memory.createThread({
            threadId: projectId,
            resourceId: projectId,
        });
    } catch (error) {
        const thread = await memory.getThreadById({ threadId: projectId });

        if (thread) {
            return;
        }

        throw error;
    }
}

async function readWorkspaceState(projectId: string) {
    const rawWorkingMemory = await memory.getWorkingMemory({
        threadId: projectId,
        resourceId: projectId,
    });

    return WorkspaceStateSchema.parse(
        rawWorkingMemory ? JSON.parse(rawWorkingMemory) : { projectId },
    );
}

/**
 * Planner-owned write path for WorkspaceState.brief.
 * Future subagent delegation must keep threadId/resourceId aligned to projectId.
 */
export const setBrief = createTool({
    id: "setBrief",
    description: "Set the project brief in thread-scoped workspace state.",
    inputSchema: SetBriefInput,
    outputSchema: SetBriefOutput,
    execute: async ({ projectId, role, brief }) => {
        if (role !== "planner") {
            throw new Error("setBrief requires planner role");
        }

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
                projectId,
                brief,
            }),
        });

        return {
            projectId,
            brief,
        };
    },
});

const SetStyleContextInput = z.object({
    projectId: z.string(),
    role: Role,
    styleContext: StyleContextSchema,
});

const SetStyleContextOutput = z.object({
    projectId: z.string(),
    styleContext: StyleContextSchema,
});

/**
 * Art Director-owned write path for WorkspaceState.styleContext.
 * Future subagent delegation must keep threadId/resourceId aligned to projectId.
 */
export const setStyleContext = createTool({
    id: "setStyleContext",
    description: "Set the shared style context in thread-scoped workspace state.",
    inputSchema: SetStyleContextInput,
    outputSchema: SetStyleContextOutput,
    execute: async ({ projectId, role, styleContext }) => {
        if (role !== "artDirector") {
            throw new Error("setStyleContext requires artDirector role");
        }

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
                projectId,
                styleContext,
            }),
        });

        return {
            projectId,
            styleContext,
        };
    },
});

const SetSceneDesignInput = z.object({
    projectId: z.string(),
    role: Role,
    sceneNumber: z.number(),
    name: z.string(),
    design: z.unknown(),
});

const SetSceneDesignOutput = z.object({
    projectId: z.string(),
    sceneRegistry: z.array(z.object({
        number: z.number(),
        name: z.string(),
        design: z.unknown().optional(),
    })),
});

/**
 * Art Director-owned write path for WorkspaceState.sceneRegistry[n].design.
 * Future subagent delegation must keep threadId/resourceId aligned to projectId.
 */
export const setSceneDesign = createTool({
    id: "setSceneDesign",
    description: "Upsert one scene design inside thread-scoped workspace state.",
    inputSchema: SetSceneDesignInput,
    outputSchema: SetSceneDesignOutput,
    execute: async ({ projectId, role, sceneNumber, name, design }) => {
        if (role !== "artDirector") {
            throw new Error("setSceneDesign requires artDirector role");
        }

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        const nextScene = {
            number: sceneNumber,
            name,
            design,
        };

        const existingIndex = currentState.sceneRegistry.findIndex(
            (scene) => scene.number === sceneNumber,
        );

        const sceneRegistry = [...currentState.sceneRegistry];

        if (existingIndex === -1) {
            sceneRegistry.push(nextScene);
        } else {
            sceneRegistry[existingIndex] = nextScene;
        }

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
                sceneRegistry,
            }),
        });

        return {
            projectId,
            sceneRegistry,
        };
    },
});

const AddAssetInput = z.object({
    projectId: z.string(),
    role: Role,
    asset: AssetSchema.omit({ createdAt: true }).extend({
        description: z.string().default(""),
    }),
});

const AddAssetOutput = z.object({
    projectId: z.string(),
    asset: AssetSchema,
});

/**
 * System-owned write path for WorkspaceState.assets.
 * Future subagent delegation must keep threadId/resourceId aligned to projectId.
 */
export const addAsset = createTool({
    id: "addAsset",
    description: "Append one uploaded image asset to thread-scoped workspace state.",
    inputSchema: AddAssetInput,
    outputSchema: AddAssetOutput,
    execute: async ({ projectId, role, asset }) => {
        if (role !== "system") {
            throw new Error("addAsset requires system role");
        }

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        const nextAsset = {
            ...asset,
            createdAt: new Date().toISOString(),
        };

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
                assets: [...currentState.assets, nextAsset],
            }),
        });

        return {
            projectId,
            asset: nextAsset,
        };
    },
});
