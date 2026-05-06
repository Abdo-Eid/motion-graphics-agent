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

export const AssetSchema = z.object({
    id: z.string(),
    path: z.string(),
    originalName: z.string(),
    mime: z.string(),
    bytes: z.number().int().nonnegative(),
    description: z.string().default(""),
    createdAt: z.string().datetime(),
});

export const WorkspaceStateSchema = z.object({
    projectId: z.string(),
    brief: BriefSchema.optional(),
    styleContext: StyleContextSchema.optional(),
    sceneRegistry: z.array(SceneRecordSchema).default([]),
    assets: z.array(AssetSchema).default([]),
});

export type Brief = z.infer<typeof BriefSchema>;
export type StyleContext = z.infer<typeof StyleContextSchema>;
export type SceneRecord = z.infer<typeof SceneRecordSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
