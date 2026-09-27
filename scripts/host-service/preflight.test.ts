import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeHostReleaseManifest } from "../host-release/index.ts";
import { hostServicePreflight } from "./preflight.ts";

const releaseFixture = async () => {
	const releaseRoot = await mkdtemp(join(tmpdir(), "trellis-host-service-preflight-"));
	await mkdir(join(releaseRoot, "bin"));
	await writeFile(join(releaseRoot, "bin", "bun"), "release bun", { mode: 0o755 });
	await writeHostReleaseManifest(releaseRoot, {
		schemaVersion: 1,
		version: "1.0.0",
		sourceCommit: "0123456789abcdef",
		target: { platform: "linux", arch: "x64", libc: { family: "glibc", version: "2.28" } },
		compatibility: {
			api: { min: "1", max: "1" },
			runtime: { protocol: 13 },
			database: { min: "0126_current", max: "0126_current" },
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
	});
	return releaseRoot;
};

test("runs the systemd preflight inside a delegated transient user unit", async () => {
	const releaseRoot = await releaseFixture();
	const calls: string[][] = [];
	try {
		await hostServicePreflight({
			releaseRoot,
			context: "systemd",
			preflightScript: "/source/scripts/host-release/preflight.ts",
			run: async (args) => {
				calls.push(args);
				return { code: 0, stdout: "", stderr: "" };
			},
		});
	} finally {
		await rm(releaseRoot, { recursive: true, force: true });
	}

	expect(calls).toEqual([
		[
			"systemd-run",
			"--user",
			"--quiet",
			"--wait",
			"--pipe",
			"--collect",
			"--property=Type=exec",
			"--property=Delegate=yes",
			join(releaseRoot, "bin/bun"),
			"/source/scripts/host-release/preflight.ts",
			"--release",
			releaseRoot,
		],
	]);
});

test("runs the foreground preflight in the supervisor process", async () => {
	const releaseRoot = await releaseFixture();
	const calls: string[][] = [];
	try {
		await hostServicePreflight({
			releaseRoot,
			context: "foreground",
			preflightScript: "/source/scripts/host-release/preflight.ts",
			run: async (args) => {
				calls.push(args);
				return { code: 0, stdout: "", stderr: "" };
			},
		});
	} finally {
		await rm(releaseRoot, { recursive: true, force: true });
	}

	expect(calls).toEqual([
		[join(releaseRoot, "bin/bun"), "/source/scripts/host-release/preflight.ts", "--release", releaseRoot],
	]);
});
