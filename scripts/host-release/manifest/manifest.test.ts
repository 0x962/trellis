import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOST_RELEASE_MANIFEST_VERSION, type HostReleaseManifestSource } from "@trellis/api";
import { verifyHostRelease, writeHostReleaseManifest } from "./manifest.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const source = (): Omit<HostReleaseManifestSource, "files"> => ({
	schemaVersion: HOST_RELEASE_MANIFEST_VERSION,
	version: "1.0.0",
	sourceCommit: "0123456789abcdef",
	target: { platform: "darwin", arch: "arm64", libc: null },
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
});

describe("host release manifest", () => {
	test("detects missing, altered, and unexpected files", async () => {
		const root = await mkdtemp(join(tmpdir(), "trellis-host-release-"));
		roots.push(root);
		await writeFile(join(root, "missing"), "present at manifest time");
		await writeFile(join(root, "altered"), "original");
		await writeHostReleaseManifest(root, source());
		expect(await verifyHostRelease(root)).toMatchObject({ ok: true, issues: [] });

		await unlink(join(root, "missing"));
		await writeFile(join(root, "altered"), "changed");
		await writeFile(join(root, "unexpected"), "new");
		expect((await verifyHostRelease(root)).issues).toEqual([
			{ path: "altered", kind: "altered" },
			{ path: "missing", kind: "missing" },
			{ path: "unexpected", kind: "unexpected" },
		]);
	});
});
