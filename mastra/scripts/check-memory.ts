import { memory } from "../src/mastra/memory/index.ts";

const threadId = process.argv[2];
const resourceId = process.argv[3] ?? threadId;

if (!threadId) {
    console.error("Usage: bun run scripts/check-memory.ts <threadId> [resourceId]");
    process.exit(1);
}

const workingMemory = await memory.getWorkingMemory({
    threadId,
    resourceId,
});

console.log(workingMemory ?? "null");
