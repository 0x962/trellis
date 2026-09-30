import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import { completeRuntimeCaptureHold, retainRuntimeCaptureHold } from "./captureHold.ts";
import { CaptureExclusion } from "./captureExclusion.ts";

let home: string;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-capture-exclusion-"));
});

afterEach(async () => rm(home, { recursive: true, force: true }));

const request: RuntimeCaptureRequest = {
	captureId: "capture-1",
	snapshotId: "snapshot-1",
	hostId: "host-1",
	dataHomeId: "home-1",
	generation: 1,
	blockId: "block-1",
	identities: [],
};

test("a delayed naming launch cannot enter the captured provider scope", async () => {
	const provider = join(home, "profiles", "one", "projects");
	const releaseNaming = Promise.withResolvers<void>();
	const delayedNaming = (async () => {
		await releaseNaming.promise;
		new CaptureExclusion().assertLaunchWritable(home, "naming-attempt", [
			{ kind: "provider", directory: provider },
		]);
	})();
	retainRuntimeCaptureHold(home, request, [{ kind: "provider", directory: provider }], false);
	releaseNaming.resolve();
	await expect(delayedNaming).rejects.toThrow("holds this runtime launch scope");
	const exclusion = new CaptureExclusion();
	expect(() => exclusion.assertLaunchWritable(home, "historical-naming-attempt")).toThrow(
		"cannot prove this launch is unrelated",
	);
	expect(() =>
		exclusion.assertLaunchWritable(home, "unrelated-attempt", [
			{ kind: "provider", directory: join(home, "profiles", "two", "projects") },
		]),
	).not.toThrow();
	completeRuntimeCaptureHold(home, { request, outcome: "abandoned" });
});
