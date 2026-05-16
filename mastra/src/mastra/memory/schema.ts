import { z } from "zod";

export const BriefSchema = z.object({
    goal: z.string(),
    audience: z.string(),
    tone: z.string(),
    duration: z.number(),
    assets: z.array(z.string()),
    keyMessages: z.array(z.string()),
    userPreferences: z.record(z.string(), z.string()).optional(),
});

export const StyleContextSchema = z.object({
    palette: z.array(z.string()),
    fonts: z.array(z.string()),
    mood: z.string(),
    animationFeel: z.string(),
    transitions: z.string(),
});

export const SceneRecordSchema = z.object({
    number: z.number(),
    name: z.string(),
    design: z.unknown().optional(),
});

export const UploadSchema = z.object({
    id: z.string(),
    path: z.string(),
    originalName: z.string(),
    mime: z.string(),
    bytes: z.number().int().nonnegative(),
    kind: z.enum(["asset", "reference"]).optional(),
    description: z.string().default(""),
    createdAt: z.string().describe("ISO 8601 timestamp"),
});

// projectId is intentionally NOT a field here. The Mastra row's threadId IS
// the projectId by T1A convention; storing it again inside the JSON blob just
// invites an agent (or Mastra's auto `updateWorkingMemory` tool) to overwrite
// it with a hallucinated string like "current". Read project id from
// `context.agent.threadId` everywhere.
export const WorkspaceStateSchema = z.object({
    brief: BriefSchema.optional(),
    styleContext: StyleContextSchema.optional(),
    sceneRegistry: z.array(SceneRecordSchema).default([]),
    uploads: z.array(UploadSchema).default([]),
    assets: z.array(UploadSchema).optional(),
});

export type Brief = z.infer<typeof BriefSchema>;
export type StyleContext = z.infer<typeof StyleContextSchema>;
export type SceneRecord = z.infer<typeof SceneRecordSchema>;
export type Upload = z.infer<typeof UploadSchema>;
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
