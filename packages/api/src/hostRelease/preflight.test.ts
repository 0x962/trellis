import { describe, expect, test } from "bun:test";
import type { HostReleaseObservation, HostReleaseTarget } from "./hostRelease.ts";
import { evaluateHostReleasePreflight } from "./preflight.ts";

const linuxTarget: HostReleaseTarget = {
	platform: "linux",
	arch: "x64",
	libc: { family: "glibc", version: "2.28" },
};

const linuxObservation: HostReleaseObservation = {
	platform: "linux",
	arch: "x64",
	osVersion: "5.14.0-427.13.1.el9_4.x86_64",
	libc: { family: "glibc", version: "2.34" },
	libstdcxxVersion: "6.0.29",
	libatomic: true,
	pidfd: true,
	cgroupV2Delegated: true,
};

describe("host release preflight", () => {
	test("accepts a supported Linux host", () => {
		expect(evaluateHostReleasePreflight(linuxTarget, linuxObservation)).toMatchObject({ ok: true });
	});

	test("names each failed Linux requirement", () => {
		const result = evaluateHostReleasePreflight(linuxTarget, {
			...linuxObservation,
			arch: "arm64",
			osVersion: "5.10.0",
			libc: { family: "musl", version: "1.2.5" },
			libstdcxxVersion: "6.0.24",
			libatomic: false,
			pidfd: false,
			pidfdError: "pidfd_open failed with errno 1",
			cgroupV2Delegated: false,
		});

		expect(result.ok).toBe(false);
		expect(result.requirements.filter(({ passed }) => !passed).map(({ id }) => id)).toEqual([
			"arch",
			"linux-kernel",
			"libc-family",
			"glibc-version",
			"libstdcxx-version",
			"libatomic",
			"pidfd",
			"cgroup-v2-delegated",
		]);
		expect(result.requirements.find(({ id }) => id === "pidfd")?.actual).toBe("pidfd_open failed with errno 1");
	});

	test("accepts macOS 13.5 and rejects an older version", () => {
		const target: HostReleaseTarget = { platform: "darwin", arch: "arm64", libc: null };
		const observation: HostReleaseObservation = {
			platform: "darwin",
			arch: "arm64",
			osVersion: "13.5",
			libc: null,
			libstdcxxVersion: null,
			libatomic: false,
			pidfd: false,
			cgroupV2Delegated: false,
		};

		expect(evaluateHostReleasePreflight(target, observation).ok).toBe(true);
		expect(evaluateHostReleasePreflight(target, { ...observation, osVersion: "13.4.1" }).requirements.at(-1)).toMatchObject({
			id: "macos-version",
			passed: false,
		});
	});
});
