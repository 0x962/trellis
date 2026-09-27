import { describe, expect, test } from "bun:test";
import type { HostReleaseManifest } from "@trellis/api";
import { hostReleasePreflightResult } from "./preflightResult.ts";

const manifest: HostReleaseManifest = {
	schemaVersion: 1,
	releaseId: "0".repeat(64),
	version: "1.0.0",
	sourceCommit: "0123456789abcdef",
	target: { platform: "linux", arch: "x64", libc: { family: "glibc", version: "2.28" } },
	compatibility: {
		api: { min: "1", max: "1" },
		runtime: { protocol: 13 },
		database: { min: "0126", max: "0126" },
	},
	runtimes: { bun: "1.3.13", node: "26.8.2", nodeAbi: "141" },
	entrypoints: {
		bun: "bin/bun",
		node: "bin/node",
		server: "bin/trellis-server",
		runtime: "bin/trellis-runtime",
		cli: "bin/trellis",
	},
	nativeModules: [],
	files: [],
};

describe("hostReleasePreflightResult", () => {
	test("returns JSON data when host observation fails", async () => {
		const result = await hostReleasePreflightResult("/release", {
			readManifest: async () => manifest,
			verify: async () => ({ ok: true, releaseId: manifest.releaseId, issues: [] }),
			observe: async () => {
				throw new Error("getconf failed with exit code 1");
			},
		});

		expect(result).toEqual({
			schemaVersion: 1,
			ok: false,
			releaseId: manifest.releaseId,
			verification: { ok: true, releaseId: manifest.releaseId, issues: [] },
			compatibility: null,
			observationError: "getconf failed with exit code 1",
		});
	});
});
