import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restartBlocks } from "./restartGate.ts";

test("restart intent fences launch and reconciliation while permitting stop, cancel, and agent work", () => {
	const home = mkdtempSync(join(tmpdir(), "restart-gate-"));
	expect(restartBlocks(home, "agentRuns.start")).toBe(false);
	writeFileSync(join(home, "restart-plan.json"), "{}");
	for (const name of [
		"agentRuns.start",
		"agentRuns.refresh",
		"flowExecutions.start",
		"flowExecutions.reconcile",
		"controller.collect",
		"controller.claim",
		"controller.dispatch",
		"reviews.deliverPending",
	])
		expect(restartBlocks(home, name)).toBe(true);
	for (const name of [
		"agentRuns.stop",
		"flowExecutions.cancel",
		"system.resumeRestart",
		"brief.get",
		"agentRuns.list",
		"tickets.update",
		"system.health",
	])
		expect(restartBlocks(home, name)).toBe(false);
});
