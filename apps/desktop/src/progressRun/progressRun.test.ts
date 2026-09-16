import { expect, test } from "bun:test";
import { progressRun } from "./progressRun.ts";

test("a restart keeps one six-step plan across the desktop relaunch", () => {
	const run = progressRun({ mode: "restart", now: 0 });
	expect(run.view(0)).toMatchObject({ step: 1, total: 6, progress: 0 });
	run.report("Stop background host", 1000);
	expect(run.view(1000)).toMatchObject({ step: 2, total: 6, progress: 1 / 6 });
	run.report("Relaunch desktop", 2000);
	const resumed = progressRun({ checkpoint: JSON.parse(JSON.stringify(run.state)) });
	resumed.report("Prepare Trellis", 4000);
	expect(resumed.view(4000)).toMatchObject({ step: 4, total: 6, progress: 3 / 6 });
	resumed.report("Restore agent sessions", 5000);
	resumed.report("Check host compatibility", 5500);
	expect(resumed.view(5500).step).toBe(5);
	resumed.report("Open Trellis", 6000);
	expect(resumed.view(6000).progress).toBe(5 / 6);
	resumed.complete(6500);
	expect(resumed.view(6500)).toMatchObject({ step: 6, total: 6, progress: 1, remainingMs: 0 });
});

test("a cold launch uses its own three-step plan", () => {
	const run = progressRun({ mode: "startup", now: 0 });
	expect(run.view(0)).toMatchObject({ step: 1, total: 3 });
	run.report("Start background host", 1000);
	expect(run.view(1000)).toMatchObject({ step: 2, total: 3 });
	run.report("Open Trellis", 2000);
	expect(run.view(2000)).toMatchObject({ step: 3, total: 3 });
});

test("estimates use measured phases and do not promise zero before completion", () => {
	const run = progressRun({
		mode: "startup",
		now: 0,
		history: { prepareApp: 1000, restoreServices: 2000, openApp: 1000 },
	});
	expect(run.view(500).remainingMs).toBe(3500);
	expect(run.view(2000).remainingMs).toBeNull();
	run.report("Start background host", 2000);
	expect(run.view(2000).remainingMs).toBe(3000);
	expect(run.state.history.prepareApp).toBeGreaterThan(1000);
	run.report("Open Trellis", 3000);
	expect(run.view(6000).remainingMs).toBeNull();
});
