import { z } from "zod";

const identity = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const binding = z.strictObject({
	executionId: identity,
	stepId: identity,
	agentRunId: identity,
	attemptId: z.uuid(),
	requestDigest: digest,
});

export const NativeInventorySchema = z.strictObject({
	version: z.literal(1),
	ready: z.boolean(),
	files: z.array(binding.extend({ digest, sourcePath: identity, path: identity })),
	unavailable: z.array(binding.extend({
		reason: z.enum(["snapshot_not_recorded", "snapshot_missing", "snapshot_digest_conflict", "snapshot_unsafe"]),
	})),
});

export const RestoredStageSchema = z.strictObject({
	payload: identity,
	manifestDigest: digest,
	targetHome: identity,
});

export const NativeFactSchema = z.object({
	execution_id: identity,
	step_id: identity,
	agent_run_id: identity,
	attempt_id: z.uuid(),
	request_digest: digest,
	launch_snapshot_digest: digest.nullable(),
});

export const FactsSchema = z.strictObject({
	version: z.literal(1),
	tables: z.array(z.strictObject({ name: identity, rows: z.array(z.unknown()) })),
});

export const LaunchBindingSchema = z.object({
	executionId: identity,
	stepId: identity,
	requestDigest: digest,
	launch: z.object({
		run: z.object({ id: identity }),
		attempt: z.object({ id: z.uuid() }),
	}),
});
