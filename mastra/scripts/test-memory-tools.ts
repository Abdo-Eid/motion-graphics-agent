import { randomUUID } from "node:crypto";

import {
    addAsset,
    setBrief,
    setSceneDesign,
    setStyleContext,
} from "../src/mastra/memory/access.ts";
import { memory } from "../src/mastra/memory/index.ts";
import { WorkspaceStateSchema } from "../src/mastra/memory/schema.ts";

const projectId = process.argv[2] ?? randomUUID();

// Simulate Mastra's invocation context. By T1A convention:
//   threadId === resourceId === projectId
//   agentId  === the calling agent's id (Mastra populates this from
//                `agent.id` at tool-call time — see
//                docs/working-memory-dilemma.md)
function ctx(agentId: string) {
    return {
        agent: { agentId, threadId: projectId, resourceId: projectId },
    } as Parameters<NonNullable<typeof setBrief.execute>>[1];
}

const allowedCtx = ctx("t1-test-agent");
const forbiddenCtx = ctx("implementor");

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

async function runTool<TInput, TOutput>(
    label: string,
    execute: ((input: TInput, context: ReturnType<typeof ctx>) => Promise<TOutput>) | undefined,
    input: TInput,
    context: ReturnType<typeof ctx> = allowedCtx,
) {
    assert(execute, `FAIL ${label}: execute handler is missing`);
    return execute(input, context);
}

async function expectFailure(label: string, run: () => Promise<unknown>) {
    try {
        await run();
    } catch {
        console.log(`PASS ${label}: rejected forbidden caller`);
        return;
    }

    throw new Error(`FAIL ${label}: forbidden caller unexpectedly succeeded`);
}

async function expectFailureWithoutMutation(
    label: string,
    run: () => Promise<unknown>,
    threadId: string,
) {
    const before = await memory.getWorkingMemory({
        threadId,
        resourceId: threadId,
    });

    await expectFailure(label, run);

    const after = await memory.getWorkingMemory({
        threadId,
        resourceId: threadId,
    });

    assert(before === after, `FAIL ${label}: forbidden call mutated working memory`);
    console.log(`PASS ${label}: working memory unchanged`);
}

await runTool("setBrief", setBrief.execute, {
    brief: {
        goal: "Create a 30 second product teaser",
        audience: "Startup founders",
        tone: "Confident and modern",
        duration: 30,
        assets: [],
        keyMessages: ["Fast setup", "Professional output"],
        userPreferences: {
            format: "landscape",
        },
    },
});

await expectFailureWithoutMutation("setBrief", () =>
    runTool(
        "setBrief forbidden-caller",
        setBrief.execute,
        {
            brief: {
                goal: "bad write",
                audience: "bad",
                tone: "bad",
                duration: 1,
                assets: [],
                keyMessages: ["bad"],
            },
        },
        forbiddenCtx,
    ),
    projectId,
);

await runTool("setStyleContext", setStyleContext.execute, {
    styleContext: {
        palette: ["#111111", "#ffffff"],
        fonts: ["Inter"],
        mood: "premium and minimal",
        animationFeel: "smooth and confident",
        transitions: "soft fades and subtle slides",
    },
});

await expectFailureWithoutMutation("setStyleContext", () =>
    runTool(
        "setStyleContext forbidden-caller",
        setStyleContext.execute,
        {
            styleContext: {
                palette: ["#000000"],
                fonts: ["Bad"],
                mood: "bad",
                animationFeel: "bad",
                transitions: "bad",
            },
        },
        forbiddenCtx,
    ),
    projectId,
);

await runTool("setSceneDesign", setSceneDesign.execute, {
    sceneNumber: 1,
    name: "Opening scene",
    design: {
        composition: "Centered logo with large headline",
        visualHierarchy: ["logo", "headline", "subtitle"],
        animationFeel: "slow fade in with slight scale",
        transition: "fade to next scene",
    },
});

await expectFailureWithoutMutation("setSceneDesign", () =>
    runTool(
        "setSceneDesign forbidden-caller",
        setSceneDesign.execute,
        {
            sceneNumber: 2,
            name: "Bad scene",
            design: {
                bad: true,
            },
        },
        forbiddenCtx,
    ),
    projectId,
);

// addAsset is system-only, never attached to an agent — keeps the explicit
// role/projectId inputs and is invoked without an agent context.
await runTool("addAsset", addAsset.execute, {
    projectId,
    role: "system",
    asset: {
        id: "asset-test-1",
        path: "assets/asset-test-1.png",
        originalName: "logo.png",
        mime: "image/png",
        bytes: 12345,
        description: "",
    },
});

const rawWorkingMemory = await memory.getWorkingMemory({
    threadId: projectId,
    resourceId: projectId,
});

assert(rawWorkingMemory, "FAIL final read: working memory is null");

const workspaceState = WorkspaceStateSchema.parse(JSON.parse(rawWorkingMemory));

assert(workspaceState.brief?.goal === "Create a 30 second product teaser", "FAIL brief.goal mismatch");
assert(workspaceState.styleContext?.mood === "premium and minimal", "FAIL styleContext.mood mismatch");
assert(workspaceState.sceneRegistry.length === 1, "FAIL sceneRegistry length mismatch");
assert(workspaceState.sceneRegistry[0]?.number === 1, "FAIL sceneRegistry[0].number mismatch");
assert(workspaceState.assets.length === 1, "FAIL assets length mismatch");
assert(workspaceState.assets[0]?.id === "asset-test-1", "FAIL assets[0].id mismatch");

console.log("");
console.log("Final working memory:");
console.log(JSON.stringify(workspaceState, null, 2));
console.log("");
console.log(`PASS all memory tools verified for ${projectId}`);
