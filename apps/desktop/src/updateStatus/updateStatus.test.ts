import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { readUpdateStatus, recordActiveRelease } from "./updateStatus.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const release = async (home: string, digit: string, protocol = 10): Promise<PinnedRelease> => {
	const manifest = { id: digit.repeat(64), version: "test", protocol };
	const root = join(home, "releases", manifest.id);
	await mkdir(root, { recursive: true });
	await writeFile(join(root, "release.json"), JSON.stringify(manifest));
	return { root, manifest };
};

test("accepts a runtime from an older release when its protocol is compatible", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-update-status-"));
	directories.push(home);
	const active = await release(home, "a");
	const available = await release(home, "b");
	await recordActiveRelease(home, active);
	await mkdir(join(home, "runtime"));
	await writeFile(
		join(home, "runtime/manifest.json"),
		JSON.stringify({ pid: process.pid, version: available.manifest.protocol, releaseId: active.manifest.id }),
	);

	const status = await readUpdateStatus(home, available);

	expect(status.state).toBe("restart-required");
	expect(status.runtimeProtocol).toBe(available.manifest.protocol);
});
