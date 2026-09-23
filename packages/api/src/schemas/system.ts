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

// The XNU kernel publishes the memory pressure level in
// `kern.memorystatus_vm_pressure_level`. 1 is normal, 2 is warning, and 4 is
// critical. The kernel picks the level, so Trellis reports the number the
// kernel gives and derives no level of its own. A computer that is not a Mac
// publishes no level, and every field below that holds one is then null.
export const MemoryPressureLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(4)]);
export type MemoryPressureLevel = z.infer<typeof MemoryPressureLevelSchema>;

// NSProcessInfo publishes these five thermal states, and Electron returns them
// from powerMonitor.getCurrentThermalState. A computer outside the macOS app
// reports no thermal state, and the field that holds one is then null.
export const ThermalStateSchema = z.enum(["unknown", "nominal", "fair", "serious", "critical"]);
export type ThermalState = z.infer<typeof ThermalStateSchema>;

// The two red lines of the machine, which the server and the web app share.
// Level 4 is the point at which macOS starts to end processes to free memory.
// Apple states that the system reduces performance at "serious" and at
// "critical". A Mac reaches memory level 2 and thermal "fair" many times an
// hour and recovers on its own, so neither counts as red.
export const memoryIsRed = (level: MemoryPressureLevel | null) => level === 4;
export const thermalIsRed = (state: ThermalState | null) => state === "serious" || state === "critical";

// `memoryPercent` is the share of the memory that is in use, which
// `/usr/bin/memory_pressure -Q` reports as a free percentage.
export const SystemUsageSampleSchema = z.object({
	at: IsoDateTimeSchema,
	cpuPercent: PercentSchema,
	memoryPercent: PercentSchema,
	memoryLevel: MemoryPressureLevelSchema.nullable(),
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
	memoryLevel: MemoryPressureLevelSchema.nullable(),
	memoryUsedBytes: CountSchema,
	memoryTotalBytes: CountSchema,
	loadAverage: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
	uptimeSeconds: CountSchema,
	history: z.array(SystemUsageSampleSchema),
});
export type SystemUsage = z.infer<typeof SystemUsageSchema>;

// One read of every process on the computer. `/bin/ps` walks the whole
// process table, which costs about a second against two thousand processes,
// so this read is separate from `SystemUsage` and runs far less often.
export const SystemProcessesSchema = z.object({
	sampledAt: IsoDateTimeSchema,
	processCount: CountSchema,
	processes: z.array(SystemProcessSchema),
});
export type SystemProcesses = z.infer<typeof SystemProcessesSchema>;

// One agent run and the memory that its process group holds.
export const PressureRunSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	ticketIdentifier: z.string().nullable(),
	memoryBytes: CountSchema,
});
export type PressureRun = z.infer<typeof PressureRunSchema>;

// `runs` holds the agent runs that use the most memory, largest first. It is
// empty while both red lines are clear, because each read walks every process.
export const MachinePressureSchema = z.object({
	memoryLevel: MemoryPressureLevelSchema.nullable(),
	runs: z.array(PressureRunSchema),
});
export type MachinePressure = z.infer<typeof MachinePressureSchema>;

// The caller sets `thermalIsRed` from the thermal state, which only the macOS
// app can read. The server answers with the heaviest runs when that flag is
// set or when its own memory level is red.
export const MachinePressureInputSchema = z.object({ thermalIsRed: z.boolean().default(false) });
export type MachinePressureInput = z.infer<typeof MachinePressureInputSchema>;

export const BackupOutputSchema = z.object({
	path: z.string().min(1),
	bytes: CountSchema,
});
export type BackupOutput = z.infer<typeof BackupOutputSchema>;
