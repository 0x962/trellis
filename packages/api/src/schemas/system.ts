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

// NSProcessInfo publishes four thermal states, and Electron adds `unknown`.
// A nominal state can also mean that the operating system cannot read the
// state. A computer outside the macOS app reports no thermal state.
export const ThermalStateSchema = z.enum(["unknown", "nominal", "fair", "serious", "critical"]);
export type ThermalState = z.infer<typeof ThermalStateSchema>;

// The managed macOS server runs one bounded native process. A failed process
// is different from a release that has no supported reader.
export const ProcessorTemperatureSchema = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("available"),
		celsius: z.number(),
		sensor: z.string(),
		source: z.literal("IOHIDEventSystemClient"),
		readDurationMs: z.number().nonnegative(),
	}),
	z.object({
		state: z.literal("unavailable"),
		reason: z.enum(["unsupported-platform", "reader-not-installed", "sensor-unavailable"]),
		readDurationMs: z.number().nonnegative(),
	}),
	z.object({
		state: z.literal("failed"),
		reason: z.enum(["reader-start", "reader-timeout", "reader-exit", "reader-output"]),
		readDurationMs: z.number().nonnegative(),
	}),
]);
export type ProcessorTemperature = z.infer<typeof ProcessorTemperatureSchema>;

// This helper identifies the high state that callers show in red. It does not
// translate the state into a resource consequence.
export const memoryIsRed = (level: MemoryPressureLevel | null) => level === 4;

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

// `loadPerCore` is the one-minute load average divided by the logical CPU
// count. It is a ratio of queued processes, not a native pressure level.
// `processorTemperature` holds the hottest measured PMU processor-die sensor
// and the full process cost. `runs` holds the agent runs that use the most
// memory, largest first.
export const MachinePressureSchema = z.object({
	sampledAt: IsoDateTimeSchema,
	hostname: z.string(),
	platform: z.string(),
	cpuCount: CountSchema,
	loadAverage1m: z.number().nonnegative(),
	loadPerCore: z.number().nonnegative(),
	memoryLevel: MemoryPressureLevelSchema.nullable(),
	processorTemperature: ProcessorTemperatureSchema,
	runs: z.array(PressureRunSchema),
});
export type MachinePressure = z.infer<typeof MachinePressureSchema>;

// A run read walks the process table. The details panel asks for it only while
// the panel is open.
export const MachinePressureInputSchema = z.object({ includeRuns: z.boolean().default(false) });
export type MachinePressureInput = z.infer<typeof MachinePressureInputSchema>;

export const BackupOutputSchema = z.object({
	path: z.string().min(1),
	bytes: CountSchema,
});
export type BackupOutput = z.infer<typeof BackupOutputSchema>;
