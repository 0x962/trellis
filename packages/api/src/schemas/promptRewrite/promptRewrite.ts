import { z } from "zod";

const text = z.string().refine((value) => value.trim().length > 0, "Enter text to rewrite.");

export const PromptRewriteInputSchema = z.strictObject({ text });
export const PromptRewriteOutputSchema = z.strictObject({ text });
export type PromptRewriteInput = z.infer<typeof PromptRewriteInputSchema>;
export type PromptRewriteOutput = z.infer<typeof PromptRewriteOutputSchema>;
