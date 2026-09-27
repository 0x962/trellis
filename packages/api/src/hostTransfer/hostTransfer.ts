import { z } from "zod";

export const HostTransferClassificationSchema = z.enum(["portable", "remappable", "reauthenticated", "unsupported"]);
export type HostTransferClassification = z.infer<typeof HostTransferClassificationSchema>;

export const HostTransferObjectKindSchema = z.enum([
	"database",
	"attachments",
	"pages",
	"repository",
	"git-common-directory",
	"worktree",
	"account-profile",
	"transcript",
	"absolute-path",
	"symlink",
]);
export type HostTransferObjectKind = z.infer<typeof HostTransferObjectKindSchema>;

export const HostTransferAbsolutePathSchema = z.string().min(1).regex(/^\//, "Enter a POSIX absolute path.");

export const HostTransferDestinationSchema = z.discriminatedUnion("state", [
	z.strictObject({
		state: z.literal("mapped"),
		path: HostTransferAbsolutePathSchema,
	}),
	z.strictObject({
		state: z.literal("excluded"),
		reason: z.string().min(1),
	}),
]);
export type HostTransferDestination = z.infer<typeof HostTransferDestinationSchema>;

const HostTransferObjectBaseSchema = z.strictObject({
	id: z.string().min(1),
	kind: HostTransferObjectKindSchema,
	sourcePath: HostTransferAbsolutePathSchema,
	classification: HostTransferClassificationSchema,
	bytes: z.number().int().nonnegative(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	secret: z.boolean(),
	destination: HostTransferDestinationSchema,
});

export const HostTransferObjectSchema = z.discriminatedUnion("kind", [
	HostTransferObjectBaseSchema.extend({
		kind: z.enum(["database", "attachments", "pages"]),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("account-profile"),
		accountId: z.string().min(1),
		provider: z.string().min(1),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("transcript"),
		assignmentId: z.string().min(1),
		provider: z.string().min(1),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("absolute-path"),
		field: z.string().min(1),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("repository"),
		gitCommonDirectoryId: z.string().min(1),
		dirtyPaths: z.array(z.string()),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("worktree"),
		repositoryId: z.string().min(1),
		gitCommonDirectoryId: z.string().min(1),
		dirtyPaths: z.array(z.string()),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("git-common-directory"),
		checkoutIds: z.array(z.string().min(1)).min(1),
	}),
	HostTransferObjectBaseSchema.extend({
		kind: z.literal("symlink"),
		target: z.string(),
		destinationTarget: z.string().nullable(),
	}),
]);
export type HostTransferObject = z.infer<typeof HostTransferObjectSchema>;

export const ProviderResumeCompatibilitySchema = z.discriminatedUnion("state", [
	z.strictObject({
		assignmentId: z.string().min(1),
		provider: z.string().min(1),
		sessionId: z.string().min(1),
		state: z.literal("compatible"),
		reason: z.null(),
	}),
	z.strictObject({
		assignmentId: z.string().min(1),
		provider: z.string().min(1),
		sessionId: z.string().min(1),
		state: z.enum(["unavailable", "unsupported"]),
		reason: z.string().min(1),
	}),
]);
export type ProviderResumeCompatibility = z.infer<typeof ProviderResumeCompatibilitySchema>;

const HostTransferEndpointBaseSchema = z.strictObject({
	hostId: z.string().min(1),
	dataHome: HostTransferAbsolutePathSchema,
	homeDirectory: HostTransferAbsolutePathSchema,
	arch: z.enum(["x64", "arm64"]),
});

export const HostTransferEndpointSchema = z.discriminatedUnion("platform", [
	HostTransferEndpointBaseSchema.extend({ platform: z.literal("darwin") }),
	HostTransferEndpointBaseSchema.extend({ platform: z.literal("linux") }),
]);
export type HostTransferEndpoint = z.infer<typeof HostTransferEndpointSchema>;

export const HostTransferManifestSchema = z
	.strictObject({
		version: z.literal(1),
		createdAt: z.iso.datetime(),
		source: HostTransferEndpointSchema,
		destination: HostTransferEndpointSchema,
		objects: z.array(HostTransferObjectSchema),
		providerResumeCompatibility: z.array(ProviderResumeCompatibilitySchema),
		totals: z.strictObject({
			objectCount: z.number().int().nonnegative(),
			bytes: z.number().int().nonnegative(),
			secretObjectCount: z.number().int().nonnegative(),
			excludedObjectCount: z.number().int().nonnegative(),
		}),
	})
	.superRefine((manifest, context) => {
		const ids = new Set<string>();
		for (const [index, object] of manifest.objects.entries()) {
			if (ids.has(object.id))
				context.addIssue({ code: "custom", path: ["objects", index, "id"], message: "Use a unique object ID." });
			ids.add(object.id);
		}
		const expected = {
			objectCount: manifest.objects.length,
			bytes: manifest.objects.reduce((total, object) => total + object.bytes, 0),
			secretObjectCount: manifest.objects.filter((object) => object.secret).length,
			excludedObjectCount: manifest.objects.filter((object) => object.destination.state === "excluded").length,
		};
		for (const key of Object.keys(expected) as Array<keyof typeof expected>)
			if (manifest.totals[key] !== expected[key])
				context.addIssue({ code: "custom", path: ["totals", key], message: "The total does not match the objects." });
	});
export type HostTransferManifest = z.infer<typeof HostTransferManifestSchema>;
