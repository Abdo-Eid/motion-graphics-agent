import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { bus } from "../server/bus.ts";
import { memory } from "./index.ts";
import {
    AssetSchema,
    BriefSchema,
    StyleContextSchema,
    WorkspaceStateSchema,
} from "./schema.ts";

// Each real agent gets ONLY the setter tool that matches its role. The
// wiring in `mastra/src/mastra/index.ts` (via each agent's `tools: {}`)
// is the primary ACL; these allowlists are the dead-man switch that
// catches wiring drift. See `docs/working-memory-dilemma.md`.
//   Planner       → `setBrief`
//   Art Director  → `setStyleContext`, `setSceneDesign`
//   Implementor   → none

const SET_BRIEF_ALLOWED: ReadonlySet<string> = new Set([
    "planner-agent",
]);

const SET_STYLE_CONTEXT_ALLOWED: ReadonlySet<string> = new Set([
    "art-director-agent",
]);

const SET_SCENE_DESIGN_ALLOWED: ReadonlySet<string> = new Set([
    "art-director-agent",
]);

interface AgentToolContext {
    agent?: {
        agentId?: string;
        threadId?: string;
        resourceId?: string;
    };
}

/**
 * Pull the project id from Mastra's tool-call context. By the T1A convention
 * the parent agent is invoked with `threadId === resourceId === projectId`,
 * and Mastra propagates that to tool calls via `context.agent`. Reading it
 * here matches `retrieveProjectKnowledge` (knowledge/retrieve.ts:43) and
 * stops agents from being able to write to the wrong project.
 */
function projectIdFromContext(
    context: AgentToolContext | undefined,
    toolName: string,
): string {
    const projectId = context?.agent?.threadId ?? context?.agent?.resourceId;

    if (!projectId) {
        throw new Error(
            `${toolName} requires a project threadId or resourceId on the agent context`,
        );
    }

    return projectId;
}

/**
 * Identity-based ACL: the calling agent's id comes from
 * `context.agent.agentId`, which Mastra populates with `agent.id` at
 * tool-call time (see `@mastra/core` v1.25 `chunk-GYS4EMOL.js:17981` —
 * `agent: { agentId: agent.id, ... }`). It is framework-owned, not
 * model-controlled, so an LLM cannot forge it the way it could forge a
 * `role` argument.
 *
 * Throws synchronously on mismatch; the Planner's `delegation` hooks in T2
 * will catch the throw and emit a `field-ownership-violation` event.
 */
function requireCaller(
    context: AgentToolContext | undefined,
    toolName: string,
    allowed: ReadonlySet<string>,
    expectedRole: string,
): string {
    const agentId = context?.agent?.agentId;

    if (!agentId) {
        throw new Error(
            `${toolName} requires context.agent.agentId — call must originate from a Mastra agent`,
        );
    }

    if (!allowed.has(agentId)) {
        bus.emitEvent("field-ownership-violation", {
            field: toolName,
            role: agentId,
            expectedRole,
        });
        throw new Error(
            `${toolName} not allowed for agent "${agentId}"`,
        );
    }

    return agentId;
}

const SetBriefInput = z.object({
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
        rawWorkingMemory ? JSON.parse(rawWorkingMemory) : {},
    );
}

/**
 * Planner-owned write path for WorkspaceState.brief.
 * Caller identity comes from `context.agent.agentId`; project id from
 * `context.agent.threadId`. Neither is supplied by the model.
 */
export const setBrief = createTool({
    id: "setBrief",
    description: "Set the project brief in thread-scoped workspace state.",
    inputSchema: SetBriefInput,
    outputSchema: SetBriefOutput,
    execute: async ({ brief }, context) => {
        requireCaller(context, "setBrief", SET_BRIEF_ALLOWED, "planner-agent");

        const projectId = projectIdFromContext(context, "setBrief");

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
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
    styleContext: StyleContextSchema,
});

const SetStyleContextOutput = z.object({
    projectId: z.string(),
    styleContext: StyleContextSchema,
});

/**
 * Art Director-owned write path for WorkspaceState.styleContext.
 * Caller identity comes from `context.agent.agentId`.
 */
export const setStyleContext = createTool({
    id: "setStyleContext",
    description: "Set the shared style context in thread-scoped workspace state.",
    inputSchema: SetStyleContextInput,
    outputSchema: SetStyleContextOutput,
    execute: async ({ styleContext }, context) => {
        requireCaller(
            context,
            "setStyleContext",
            SET_STYLE_CONTEXT_ALLOWED,
            "art-director-agent",
        );

        const projectId = projectIdFromContext(context, "setStyleContext");

        await ensureThread(projectId);

        const currentState = await readWorkspaceState(projectId);

        await memory.updateWorkingMemory({
            threadId: projectId,
            resourceId: projectId,
            workingMemory: JSON.stringify({
                ...currentState,
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
 * Caller identity comes from `context.agent.agentId`.
 */
export const setSceneDesign = createTool({
    id: "setSceneDesign",
    description: "Upsert one scene design inside thread-scoped workspace state.",
    inputSchema: SetSceneDesignInput,
    outputSchema: SetSceneDesignOutput,
    execute: async ({ sceneNumber, name, design }, context) => {
        requireCaller(
            context,
            "setSceneDesign",
            SET_SCENE_DESIGN_ALLOWED,
            "art-director-agent",
        );

        const projectId = projectIdFromContext(context, "setSceneDesign");

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

const AssetInput = AssetSchema.omit({ createdAt: true }).extend({
    description: z.string().default(""),
});

type AppendAssetInput = z.input<typeof AssetInput>;

/**
 * Internal system-side append for WorkspaceState.assets. Stamps createdAt and
 * defaults description. Used by the addAsset tool (after role check) and
 * directly by upload handlers, which run as system and skip the role guard.
 */
export async function appendAsset(input: { projectId: string; asset: AppendAssetInput }) {
    await ensureThread(input.projectId);

    const currentState = await readWorkspaceState(input.projectId);

    const nextAsset = {
        ...input.asset,
        description: input.asset.description ?? "",
        createdAt: new Date().toISOString(),
    };

    await memory.updateWorkingMemory({
        threadId: input.projectId,
        resourceId: input.projectId,
        workingMemory: JSON.stringify({
            ...currentState,
            assets: [...currentState.assets, nextAsset],
        }),
    });

    return nextAsset;
}

// addAsset is system-only and never attached to an agent (per
// T1A-memory-and-state.md), so it keeps an explicit `role: "system"`
// gate plus the explicit projectId — there is no calling agent context to
// read identity from.
const SystemRole = z.enum(["system"]);

const AddAssetInput = z.object({
    projectId: z.string(),
    role: SystemRole,
    asset: AssetInput,
});

const AddAssetOutput = z.object({
    projectId: z.string(),
    asset: AssetSchema,
});

/**
 * System-owned write path for WorkspaceState.assets. NOT attached to agents.
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

        const nextAsset = await appendAsset({ projectId, asset });

        return {
            projectId,
            asset: nextAsset,
        };
    },
});
