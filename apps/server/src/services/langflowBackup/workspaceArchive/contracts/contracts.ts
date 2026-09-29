import { z } from "zod";

const label = z.string().min(1);
const path = label.refine((value) => !value.includes("\\") && !value.includes("\0") &&
	value.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const root = z.enum(["worktree", "git", "common"]);
const location = { root, path };
const mode = z.number().int().min(0).max(0o777);

export const WorkspaceBindingSchema = z.strictObject({
	captureId: label,
	snapshotId: z.uuid(),
	hostId: z.uuid(),
	dataHomeId: z.uuid(),
	blockId: z.uuid(),
	generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	workspaceId: label,
	runs: z.array(z.strictObject({ runId: label, attemptId: label.nullable() })),
});

export const WorkspaceEntrySchema = z.discriminatedUnion("kind", [
	z.strictObject({ ...location, kind: z.literal("directory"), mode }),
	z.strictObject({ ...location, kind: z.literal("file"), mode }),
	z.strictObject({ ...location, kind: z.literal("symlink"), target: label }),
]);

export const WorkspaceInventorySchema = z.strictObject({
	binding: WorkspaceBindingSchema,
	repository: z.strictObject({
		gitDirectory: label,
		commonDirectory: label,
		objectFormat: z.enum(["sha1", "sha256"]),
	}).nullable(),
	entries: z.array(WorkspaceEntrySchema),
});

export const WorkspaceArchiveSchema = z.strictObject({
	version: z.literal(1),
	inventory: WorkspaceInventorySchema,
	files: z.array(z.strictObject({
		...location,
		object: z.string().regex(/^[0-9]+$/),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
		size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	})),
});

export type WorkspaceBinding = z.infer<typeof WorkspaceBindingSchema>;
export type WorkspaceInventory = z.infer<typeof WorkspaceInventorySchema>;
export type WorkspaceArchive = z.infer<typeof WorkspaceArchiveSchema>;

export type WorkspaceCaptureReader = {
	list(binding: WorkspaceBinding): Promise<WorkspaceInventory>;
	read(binding: WorkspaceBinding, location: { root: "worktree" | "git" | "common"; path: string }): AsyncIterable<Uint8Array>;
};
