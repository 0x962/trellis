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

const PercentSchema = z.number().min(0).max(100);

export const SystemUsageSampleSchema = z.object({
	at: IsoDateTimeSchema,
	cpuPercent: PercentSchema,
	memoryPercent: PercentSchema,
});
export type SystemUsageSample = z.infer<typeof SystemUsageSampleSchema>;

export const SystemProcessSchema = z.object({
	pid: CountSchema,
	parentPid: CountSchema,
	user: z.string(),
	cpuPercent: z.number().nonnegative(),
	memoryBytes: CountSchema,
	memoryPercent: PercentSchema,
	elapsedSeconds: CountSchema,
	state: z.string(),
	command: z.string(),
});
export type SystemProcess = z.infer<typeof SystemProcessSchema>;

export const SystemUsageSchema = z.object({
	sampledAt: IsoDateTimeSchema,
	hostname: z.string(),
	platform: z.string(),
	cpuModel: z.string(),
	cpuCount: CountSchema,
	cpuPercent: PercentSchema,
	memoryPercent: PercentSchema,
	memoryUsedBytes: CountSchema,
	memoryTotalBytes: CountSchema,
	loadAverage: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
	uptimeSeconds: CountSchema,
	processCount: CountSchema,
	history: z.array(SystemUsageSampleSchema),
	processes: z.array(SystemProcessSchema),
});
export type SystemUsage = z.infer<typeof SystemUsageSchema>;

export const BackupOutputSchema = z.object({
	path: z.string().min(1),
	bytes: CountSchema,
});
export type BackupOutput = z.infer<typeof BackupOutputSchema>;
