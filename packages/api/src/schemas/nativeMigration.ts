import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
import { ProjectManagerConfigSchema } from "./project.ts";

export const NativeMigrationInventoryInputSchema = z.object({ project: ProjectRefStringSchema });
export const NativeMigrationApplyInputSchema = NativeMigrationInventoryInputSchema.extend({
	expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
	directory: z
		.string()
		.min(1)
		.refine((value) => value.startsWith("/") && !value.includes("\0"), "Use an absolute directory path."),
	requestId: z.uuid(),
});
export const NativeMigrationRollbackInputSchema = z.object({
	migrationId: UlidSchema,
	expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
});
export const NativeMigrationSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	actorName: z.string(),
	requestId: z.uuid(),
	expectedVersion: z.string(),
	beforeConfig: z.record(z.string(), z.unknown()),
	appliedConfig: ProjectManagerConfigSchema,
	createdAt: IsoDateTimeSchema,
	rolledBackAt: IsoDateTimeSchema.nullable(),
	rollbackVersion: z.string().nullable(),
});
const ProjectSnapshotSchema = z.object({
	id: UlidSchema,
	parentId: UlidSchema.nullable(),
	name: z.string(),
	config: z.record(z.string(), z.unknown()),
	updatedAt: IsoDateTimeSchema,
});
const AgentSnapshotSchema = z.object({
	id: z.string(),
	projectId: UlidSchema,
	source: z.enum(["legacy", "persona"]),
	state: z.string(),
	runtime: z.string(),
	role: z.string(),
	workspaceId: z.string().nullable(),
	terminalId: z.string().nullable(),
	conversationId: z.string().nullable(),
});
const DeliverySnapshotSchema = z.object({
	id: z.string(),
	projectId: UlidSchema,
	source: z.enum(["manager", "review"]),
	runId: z.string().nullable(),
	state: z.string(),
	generation: z.number(),
	terminalId: z.string().nullable(),
});
const FlowSnapshotSchema = z.object({
	id: z.string(),
	projectId: UlidSchema,
	revision: z.number(),
	state: z.record(z.string(), z.unknown()),
});
export const NativeMigrationInventorySchema = z.object({
	projectId: UlidSchema,
	version: z.string(),
	originalConfig: z.record(z.string(), z.unknown()),
	managerConfig: ProjectManagerConfigSchema,
	projects: z.array(ProjectSnapshotSchema),
	agents: z.array(AgentSnapshotSchema),
	deliveries: z.array(DeliverySnapshotSchema),
	flows: z.array(FlowSnapshotSchema),
	checks: z.array(
		z.object({ id: z.string(), projectId: UlidSchema, runId: z.string(), attemptId: z.string(), state: z.string() }),
	),
	migrations: z.array(NativeMigrationSchema),
	blockers: z.array(
		z.object({
			id: z.string(),
			projectId: UlidSchema,
			kind: z.enum(["agent", "delivery", "flow", "check"]),
			reason: z.string(),
		}),
	),
});
export type NativeMigration = z.infer<typeof NativeMigrationSchema>;
export type NativeMigrationInventory = z.infer<typeof NativeMigrationInventorySchema>;
export type NativeMigrationApplyInput = z.infer<typeof NativeMigrationApplyInputSchema>;
export type NativeMigrationRollbackInput = z.infer<typeof NativeMigrationRollbackInputSchema>;
