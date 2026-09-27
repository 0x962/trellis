import { z } from "zod";

export const HOST_RELEASE_MANIFEST_VERSION = 1 as const;

export const HostReleasePlatformSchema = z.enum(["darwin", "linux"]);
export type HostReleasePlatform = z.infer<typeof HostReleasePlatformSchema>;

export const HostReleaseArchSchema = z.enum(["x64", "arm64"]);
export type HostReleaseArch = z.infer<typeof HostReleaseArchSchema>;

export const HostReleaseTargetSchema = z.discriminatedUnion("platform", [
	z.strictObject({
		platform: z.literal("darwin"),
		arch: HostReleaseArchSchema,
		libc: z.null(),
	}),
	z.strictObject({
		platform: z.literal("linux"),
		arch: HostReleaseArchSchema,
		libc: z.strictObject({ family: z.literal("glibc"), version: z.string().min(1) }),
	}),
]);
export type HostReleaseTarget = z.infer<typeof HostReleaseTargetSchema>;

const CompatibilityRangeSchema = z.strictObject({ min: z.string().min(1), max: z.string().min(1) });

export const HostReleaseCompatibilitySchema = z.strictObject({
	api: CompatibilityRangeSchema,
	runtime: z.strictObject({ protocol: z.number().int().positive() }),
	database: CompatibilityRangeSchema,
});
export type HostReleaseCompatibility = z.infer<typeof HostReleaseCompatibilitySchema>;

export const HostReleaseFileSchema = z.strictObject({
	path: z.string().min(1),
	type: z.enum(["file", "symlink"]),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	size: z.number().int().nonnegative(),
	executable: z.boolean(),
});
export type HostReleaseFile = z.infer<typeof HostReleaseFileSchema>;

export const HostReleaseEntrypointsSchema = z.strictObject({
	bun: z.string().min(1),
	node: z.string().min(1),
	server: z.string().min(1),
	runtime: z.string().min(1),
	cli: z.string().min(1),
});
export type HostReleaseEntrypoints = z.infer<typeof HostReleaseEntrypointsSchema>;

export const HostReleaseNativeModuleSchema = z.strictObject({
	name: z.string().min(1),
	version: z.string().min(1),
	nodeAbi: z.string().min(1),
	path: z.string().min(1),
});
export type HostReleaseNativeModule = z.infer<typeof HostReleaseNativeModuleSchema>;

export const HostReleaseManifestSchema = z.strictObject({
	schemaVersion: z.literal(HOST_RELEASE_MANIFEST_VERSION),
	releaseId: z.string().regex(/^[a-f0-9]{64}$/),
	version: z.string().min(1),
	sourceCommit: z.string().min(1),
	target: HostReleaseTargetSchema,
	compatibility: HostReleaseCompatibilitySchema,
	runtimes: z.strictObject({
		bun: z.string().min(1),
		node: z.string().min(1),
		nodeAbi: z.string().min(1),
	}),
	entrypoints: HostReleaseEntrypointsSchema,
	nativeModules: z.array(HostReleaseNativeModuleSchema),
	files: z.array(HostReleaseFileSchema),
});
export type HostReleaseManifest = z.infer<typeof HostReleaseManifestSchema>;
export type HostReleaseManifestSource = Omit<HostReleaseManifest, "releaseId">;

export const HostReleaseObservationSchema = z.strictObject({
	platform: HostReleasePlatformSchema,
	arch: HostReleaseArchSchema,
	osVersion: z.string().min(1),
	libc: z
		.strictObject({ family: z.string().min(1), version: z.string().min(1) })
		.nullable(),
	libstdcxxVersion: z.string().min(1).nullable(),
	libatomic: z.boolean(),
	pidfd: z.boolean(),
	pidfdError: z.string().min(1).optional(),
	cgroupV2Delegated: z.boolean(),
});
export type HostReleaseObservation = z.infer<typeof HostReleaseObservationSchema>;

export const HostReleaseRequirementSchema = z.strictObject({
	id: z.enum([
		"platform",
		"arch",
		"macos-version",
		"linux-kernel",
		"libc-family",
		"glibc-version",
		"libstdcxx-version",
		"libatomic",
		"pidfd",
		"cgroup-v2-delegated",
	]),
	passed: z.boolean(),
	required: z.string(),
	actual: z.string(),
});
export type HostReleaseRequirement = z.infer<typeof HostReleaseRequirementSchema>;

export const HostReleasePreflightSchema = z.strictObject({
	schemaVersion: z.literal(1),
	ok: z.boolean(),
	target: HostReleaseTargetSchema,
	observation: HostReleaseObservationSchema,
	requirements: z.array(HostReleaseRequirementSchema),
});
export type HostReleasePreflight = z.infer<typeof HostReleasePreflightSchema>;
