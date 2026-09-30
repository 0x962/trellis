import type { RuntimeCaptureBinding, RuntimeCaptureProducer } from "@trellis/runtime-protocol";
import { z } from "zod";

const label = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const size = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const path = label.refine((value) => !value.includes("\\") && !value.includes("\0") &&
	value.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const root = z.enum(["worktree", "git", "common"]);
const mode = z.number().int().min(0).max(0o777);
const identity = z.strictObject({
	harness: label, accountId: label.nullable(), profileId: label.nullable(),
	agentRunId: label, attemptId: label, providerSessionId: label.nullable(),
});
const rootBase = { rootId: label, originalIdentity: label };
const runtimeRoot = z.discriminatedUnion("kind", [
	z.strictObject({ ...rootBase, kind: z.literal("worktree"), sourceKind: z.literal("workspace") }),
	z.strictObject({ ...rootBase, kind: z.literal("git"), sourceKind: z.literal("git-directory"), objectFormat: z.enum(["sha1", "sha256"]) }),
	z.strictObject({ ...rootBase, kind: z.literal("common"), sourceKind: z.literal("common-directory"), objectFormat: z.enum(["sha1", "sha256"]) }),
	z.strictObject({ ...rootBase, kind: z.literal("conversation"), sourceKind: z.enum(["account-profile", "opencode-export"]), identity }),
]);

export const WorkspaceBindingSchema = z.strictObject({
	captureId: label, snapshotId: label, hostId: label, dataHomeId: label, blockId: label,
	generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	workspaceId: label, identities: z.array(identity), roots: z.array(runtimeRoot),
}) satisfies z.ZodType<RuntimeCaptureBinding>;

const unavailable = z.array(z.strictObject({
	identity, sourceKind: z.enum(["account-profile", "opencode-export"]), code: label, message: z.string(),
}));
const runtimeEntry = z.discriminatedUnion("kind", [
	z.strictObject({ rootId: label, path, kind: z.literal("directory"), mode }),
	z.strictObject({ rootId: label, path, kind: z.literal("file"), mode, size, sha256: digest }),
	z.strictObject({ rootId: label, path, kind: z.literal("symlink"), target: label }),
]);
export const RuntimeWorkspaceInventorySchema = z.strictObject({
	binding: WorkspaceBindingSchema, entries: z.array(runtimeEntry), unavailable,
});
const location = { root, rootId: label, path };
export const WorkspaceEntrySchema = z.discriminatedUnion("kind", [
	z.strictObject({ ...location, kind: z.literal("directory"), mode }),
	z.strictObject({ ...location, kind: z.literal("file"), mode, size, sha256: digest }),
	z.strictObject({ ...location, kind: z.literal("symlink"), target: label }),
]);
export const WorkspaceInventorySchema = z.strictObject({
	binding: WorkspaceBindingSchema,
	repository: z.strictObject({ gitDirectory: label, commonDirectory: label, objectFormat: z.enum(["sha1", "sha256"]) }).nullable(),
	entries: z.array(WorkspaceEntrySchema), unavailable,
});
export const WorkspaceArchiveSchema = z.strictObject({
	version: z.literal(1), inventory: WorkspaceInventorySchema,
	files: z.array(z.strictObject({ root, path, object: z.string().regex(/^[0-9]+$/), sha256: digest, size })),
});
export const WorkspaceSealSchema = z.strictObject({
	schemaVersion: z.literal(1), kind: z.literal("trellis-runtime-capture-seal"),
	binding: WorkspaceBindingSchema, rootId: label, manifestSha256: digest,
});
export type WorkspaceBinding = RuntimeCaptureBinding;
export type WorkspaceCaptureReader = RuntimeCaptureProducer;
export type WorkspaceInventory = z.infer<typeof WorkspaceInventorySchema>;
export type WorkspaceArchive = z.infer<typeof WorkspaceArchiveSchema>;
