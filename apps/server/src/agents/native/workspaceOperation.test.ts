import { expect, test } from "bun:test";
import { workspaceOperation } from "./workspaceOperation.ts";

test("a sweep waits for a launch in its workspace while another workspace proceeds", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const events: string[] = [];
	const launch = workspaceOperation("/work/one", async () => {
		entered.resolve();
		await release.promise;
		events.push("launched");
	});
	await entered.promise;
	const sweep = workspaceOperation("/work/one", async () => {
		events.push("swept");
	});
	await workspaceOperation("/work/two", async () => {
		events.push("other");
	});
	expect(events).toEqual(["other"]);
	release.resolve();
	await Promise.all([launch, sweep]);
	expect(events).toEqual(["other", "launched", "swept"]);
});
