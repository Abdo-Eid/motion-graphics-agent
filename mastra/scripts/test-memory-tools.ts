import {
    addAsset,
    setBrief,
    setSceneDesign,
    setStyleContext,
} from "../src/mastra/memory/access.ts";
import { memory } from "../src/mastra/memory/index.ts";
import { WorkspaceStateSchema } from "../src/mastra/memory/schema.ts";

const projectId = process.argv[2] ?? `t1a-delivery-${Date.now()}`;
const toolContext = {} as Parameters<NonNullable<typeof setBrief.execute>>[1];

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

async function runTool<TInput, TOutput>(
    label: string,
    execute: ((input: TInput, context: typeof toolContext) => Promise<TOutput>) | undefined,
    input: TInput,
) {
    assert(execute, `FAIL ${label}: execute handler is missing`);
    return execute(input, toolContext);
}

async function expectRoleFailure(label: string, run: () => Promise<unknown>) {
    try {
        await run();
    } catch (error) {
        console.log(`PASS ${label}: rejected wrong role`);
        return;
    }

    throw new Error(`FAIL ${label}: wrong-role call unexpectedly succeeded`);
}

async function expectRoleFailureWithoutMutation(
    label: string,
    run: () => Promise<unknown>,
    threadId: string,
) {
    const before = await memory.getWorkingMemory({
        threadId,
        resourceId: threadId,
    });

    await expectRoleFailure(label, run);

    const after = await memory.getWorkingMemory({
        threadId,
        resourceId: threadId,
    });

    assert(before === after, `FAIL ${label}: wrong-role call mutated working memory`);
    console.log(`PASS ${label}: working memory unchanged`);
}

await runTool("setBrief", setBrief.execute, {
    projectId,
    role: "planner",
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

await expectRoleFailureWithoutMutation("setBrief", () =>
    runTool("setBrief wrong-role", setBrief.execute, {
        projectId,
        role: "implementor",
        brief: {
            goal: "bad write",
            audience: "bad",
            tone: "bad",
            duration: 1,
            assets: [],
            keyMessages: ["bad"],
        },
    }),
    projectId,
);

await runTool("setStyleContext", setStyleContext.execute, {
    projectId,
    role: "artDirector",
    styleContext: {
        palette: ["#111111", "#ffffff"],
        fonts: ["Inter"],
        mood: "premium and minimal",
        animationFeel: "smooth and confident",
        transitions: "soft fades and subtle slides",
    },
});

await expectRoleFailureWithoutMutation("setStyleContext", () =>
    runTool("setStyleContext wrong-role", setStyleContext.execute, {
        projectId,
        role: "planner",
        styleContext: {
            palette: ["#000000"],
            fonts: ["Bad"],
            mood: "bad",
            animationFeel: "bad",
            transitions: "bad",
        },
    }),
    projectId,
);

await runTool("setSceneDesign", setSceneDesign.execute, {
    projectId,
    role: "artDirector",
    sceneNumber: 1,
    name: "Opening scene",
    design: {
        composition: "Centered logo with large headline",
        visualHierarchy: ["logo", "headline", "subtitle"],
        animationFeel: "slow fade in with slight scale",
        transition: "fade to next scene",
    },
});

await expectRoleFailureWithoutMutation("setSceneDesign", () =>
    runTool("setSceneDesign wrong-role", setSceneDesign.execute, {
        projectId,
        role: "planner",
        sceneNumber: 2,
        name: "Bad scene",
        design: {
            bad: true,
        },
    }),
    projectId,
);

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

await expectRoleFailureWithoutMutation("addAsset", () =>
    runTool("addAsset wrong-role", addAsset.execute, {
        projectId,
        role: "planner",
        asset: {
            id: "asset-test-2",
            path: "assets/asset-test-2.png",
            originalName: "bad.png",
            mime: "image/png",
            bytes: 1,
            description: "",
        },
    }),
    projectId,
);

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
