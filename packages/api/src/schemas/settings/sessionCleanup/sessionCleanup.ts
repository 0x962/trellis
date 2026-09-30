import { z } from "zod";

export const SessionCleanupSchema = z.strictObject({
	archiveAfterDays: z.number().int().positive().nullable(),
	deleteAfterDays: z.number().int().positive().nullable(),
});

export type SessionCleanup = z.infer<typeof SessionCleanupSchema>;

export const defaultSessionCleanup: SessionCleanup = { archiveAfterDays: 3, deleteAfterDays: 7 };

export const SESSION_DAY_MS = 24 * 60 * 60 * 1000;
