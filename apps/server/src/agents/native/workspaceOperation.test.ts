import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceOperation } from "./workspaceOperation.ts";

test("a sweep waits for a launch in its workspace while another workspace proceeds", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-workspace-operation-"));
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const events: string[] = [];
	const launch = workspaceOperation(home, join(home, "work-one"), async () => {
		entered.resolve();
		await release.promise;
		events.push("launched");
	});
	await entered.promise;
	const sweep = workspaceOperation(home, join(home, "work-one"), async () => {
		events.push("swept");
	});
	await workspaceOperation(home, join(home, "work-two"), async () => {
		events.push("other");
	});
	expect(events).toEqual(["other"]);
	release.resolve();
	await Promise.all([launch, sweep]);
	expect(events).toEqual(["other", "launched", "swept"]);
	await rm(home, { recursive: true, force: true });
});
