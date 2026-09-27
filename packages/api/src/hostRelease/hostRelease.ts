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

export const HOST_RELEASE_SUPPORT = {
	darwin: { minVersion: "13.5" },
	linux: {
		minKernel: "5.14",
		libc: { family: "glibc", minVersion: "2.28" },
		minLibstdcxxVersion: "6.0.25",
	},
} as const;

const versionParts = (version: string): number[] =>
	version
		.match(/^\d+(?:\.\d+)*/)?.[0]
		.split(".")
		.map(Number) ?? [];

export const compareHostVersions = (left: string, right: string): number => {
	const a = versionParts(left);
	const b = versionParts(right);
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
};

const requirement = (
	id: HostReleaseRequirement["id"],
	passed: boolean,
	required: string,
	actual: string,
): HostReleaseRequirement => ({ id, passed, required, actual });

export const evaluateHostReleasePreflight = (
	target: HostReleaseTarget,
	observation: HostReleaseObservation,
): HostReleasePreflight => {
	const requirements: HostReleaseRequirement[] = [
		requirement("platform", observation.platform === target.platform, target.platform, observation.platform),
		requirement("arch", observation.arch === target.arch, target.arch, observation.arch),
	];
	if (target.platform === "darwin") {
		requirements.push(
			requirement(
				"macos-version",
				observation.platform === "darwin" &&
					compareHostVersions(observation.osVersion, HOST_RELEASE_SUPPORT.darwin.minVersion) >= 0,
				`>=${HOST_RELEASE_SUPPORT.darwin.minVersion}`,
				observation.osVersion,
			),
		);
	} else {
		const support = HOST_RELEASE_SUPPORT.linux;
		const glibcVersion =
			compareHostVersions(target.libc.version, support.libc.minVersion) >= 0
				? target.libc.version
				: support.libc.minVersion;
		requirements.push(
			requirement(
				"linux-kernel",
				observation.platform === "linux" && compareHostVersions(observation.osVersion, support.minKernel) >= 0,
				`>=${support.minKernel}`,
				observation.osVersion,
			),
			requirement(
				"libc-family",
				observation.libc?.family === target.libc.family,
				target.libc.family,
				observation.libc?.family ?? "unavailable",
			),
			requirement(
				"glibc-version",
				observation.libc?.family === "glibc" && compareHostVersions(observation.libc.version, glibcVersion) >= 0,
				`>=${glibcVersion}`,
				observation.libc?.version ?? "unavailable",
			),
			requirement(
				"libstdcxx-version",
				observation.libstdcxxVersion !== null &&
					compareHostVersions(observation.libstdcxxVersion, support.minLibstdcxxVersion) >= 0,
				`>=${support.minLibstdcxxVersion}`,
				observation.libstdcxxVersion ?? "unavailable",
			),
			requirement("libatomic", observation.libatomic, "available", observation.libatomic ? "available" : "unavailable"),
			requirement("pidfd", observation.pidfd, "available", observation.pidfd ? "available" : "unavailable"),
			requirement(
				"cgroup-v2-delegated",
				observation.cgroupV2Delegated,
				"available",
				observation.cgroupV2Delegated ? "available" : "unavailable",
			),
		);
	}
	return {
		schemaVersion: 1,
		ok: requirements.every(({ passed }) => passed),
		target,
		observation,
		requirements,
	};
};
