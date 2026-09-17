import { z } from "zod";

export const DiagnosticsSchema = z.object({
	host: z.object({ bootId: z.string(), version: z.string(), home: z.string() }),
	runtime: z.object({
		state: z.enum(["running", "stopped", "unavailable"]),
		pid: z.number().nullable(),
		protocol: z.number().nullable(),
		expectedProtocol: z.number(),
		error: z.string().nullable(),
	}),
	queue: z.object({
		pending: z.number(),
		sending: z.number(),
		unknown: z.number(),
		oldestDueAt: z.string().nullable(),
	}),
	lastObservationAt: z.string().nullable(),
	unresolvedAttempts: z.array(z.object({ id: z.string(), state: z.string(), error: z.string().nullable() })),
	logs: z.array(z.string()),
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;
