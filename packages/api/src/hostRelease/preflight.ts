import type {
	HostReleaseObservation,
	HostReleasePreflight,
	HostReleaseRequirement,
	HostReleaseTarget,
} from "./hostRelease.ts";

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
			requirement(
				"pidfd",
				observation.pidfd,
				"available",
				observation.pidfd ? "available" : (observation.pidfdError ?? "unavailable"),
			),
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
