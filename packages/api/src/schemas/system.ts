import { z } from "zod";
import { GhReasonSchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// `checkedAt` is null until the first gh check after boot finishes.
export const GhStatusSchema = z.object({
	ok: z.boolean(),
	user: z.string().nullable(),
	reason: GhReasonSchema.nullable(),
	message: z.string().nullable(),
	checkedAt: IsoDateTimeSchema.nullable(),
});
export type GhStatus = z.infer<typeof GhStatusSchema>;

// `bootId` changes on every server start; event ids carry it.
export const HealthSchema = z.object({
	ok: z.boolean(),
	version: z.string(),
	apiVersion: z.string(),
	bootId: UlidSchema,
	rss: CountSchema,
	// Every URL the server answers on, network addresses first. A phone can
	// reach only an address that is not loopback.
	addresses: z.array(z.string()),
	db: z.object({
		ok: z.boolean(),
		sizeBytes: CountSchema,
	}),
	gh: GhStatusSchema,
});
export type Health = z.infer<typeof HealthSchema>;

// One agent of a desktop restart. `resuming` is the entry the host works on
// now. A `failed` entry keeps its error and waits for the next resume call.
export const RestartSessionStateSchema = z.enum(["pending", "resuming", "resumed", "skipped", "failed"]);
export type RestartSessionState = z.infer<typeof RestartSessionStateSchema>;

export const RestartStatusSchema = z.object({
	restartId: z.string().min(1),
	createdAt: IsoDateTimeSchema,
	startedAt: IsoDateTimeSchema.nullable(),
	finishedAt: IsoDateTimeSchema.nullable(),
	// A failure of the whole resume, for example an execution service that does not answer.
	error: z.string().nullable(),
	sessions: z.array(
		z.object({
			runId: z.string().min(1),
			runName: z.string().nullable(),
			projectId: UlidSchema.nullable(),
			projectPath: z.string().nullable(),
			state: RestartSessionStateSchema,
			error: z.string().nullable(),
		}),
	),
});
export type RestartStatus = z.infer<typeof RestartStatusSchema>;

export const RestartResumeOutputSchema = z.object({
	restartId: z.string().min(1),
	// False while the host still resumes agents in the background.
	finished: z.boolean(),
	resumed: CountSchema,
	skipped: CountSchema,
	failed: CountSchema,
});
export type RestartResumeOutput = z.infer<typeof RestartResumeOutputSchema>;

export const BackupOutputSchema = z.object({
	path: z.string().min(1),
	bytes: CountSchema,
});
export type BackupOutput = z.infer<typeof BackupOutputSchema>;
