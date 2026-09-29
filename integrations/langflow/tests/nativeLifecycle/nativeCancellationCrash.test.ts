import { describe, expect, test } from "bun:test";
import { cancellationProcessFixture } from "../../fixtures/nativeHost/cancellationProcessFixture.ts";

describe.serial("F7 persistent native cancellation", () => {
	test("kills the cancellation writer before and after commit and retains the exact stop", async () => {
		const fixture = cancellationProcessFixture();
		try {
			const home = await fixture.create();
			const original = await fixture.execute(home, "launch");
			const before = await fixture.execute(home, "cancel_before_commit", true);
			expect(before.state.status).toBe("canceled");
			expect(before.nativePid).toBe(original.nativePid);
			expect(before.authorityPid).not.toBe(original.nativePid);
			const rollback = await fixture.execute(home, "inspect");
			expect(rollback.state.status).toBe("running");
			expect(rollback.state.revision).toBe(original.state.revision);
			expect(rollback.nativeStatus).toBe("running");
			expect(rollback).toMatchObject({
				attemptId: original.attemptId,
				stepId: original.stepId,
				nativePid: original.nativePid,
			});
			expect(rollback.state.steps[0]).toMatchObject({ state: "running", needsStop: false });
			await fixture.execute(home, "cancel_after_commit", true);
			const committed = await fixture.execute(home, "inspect");
			expect(committed).toMatchObject({
				attemptId: original.attemptId,
				stepId: original.stepId,
				nativePid: original.nativePid,
				taskRows: 1,
				bindingRows: 1,
				attemptRows: 1,
				claimAvailable: false,
				nativeStatus: "running",
			});
			expect(committed.state.status).toBe("canceled");
			expect(committed.state.revision).toBeGreaterThan(original.state.revision);
			expect(committed.state.steps[0]).toMatchObject({ state: "canceled", needsStop: true });
			const failed = await fixture.execute(home, "stop_failure");
			expect(failed.errors).toEqual(["fixture_stop_unconfirmed"]);
			const retained = await fixture.execute(home, "inspect");
			expect(retained.state.steps[0]).toMatchObject({ needsStop: true, error: "fixture_stop_unconfirmed" });
			expect(retained.nativeStatus).toBe("running");
			const stopped = await fixture.execute(home, "stop");
			expect(stopped.errors).toEqual([]);
			expect(stopped.state.steps[0]).toMatchObject({ needsStop: false, error: null });
			expect(stopped).toMatchObject({
				attemptId: original.attemptId,
				nativePid: original.nativePid,
				resultId: null,
				nativeStatus: "exited",
			});
		} finally {
			await fixture.cleanup();
		}
	}, 120_000);

	test("preserves both commit orders of cancellation and final native output", async () => {
		const fixture = cancellationProcessFixture();
		try {
			for (const action of ["cancel_then_output", "output_then_cancel"]) {
				const home = await fixture.create();
				const original = await fixture.execute(home, "launch");
				const raced = await fixture.execute(home, action);
				expect(raced.snapshot).toMatchObject({ resultId: "result-cancel-race", result: "Final output from fixture" });
				const retained = await fixture.execute(home, "inspect");
				expect(retained).toMatchObject({
					attemptId: original.attemptId,
					stepId: original.stepId,
					nativePid: original.nativePid,
					taskRows: 1,
					bindingRows: 1,
					attemptRows: 1,
					claimAvailable: false,
					resultId: action === "cancel_then_output" ? null : "result-cancel-race",
				});
				expect(retained.state.status).toBe(action === "cancel_then_output" ? "canceled" : "succeeded");
				if (action === "cancel_then_output") expect(raced.recorded).toBe(false);
				await fixture.execute(home, "stop");
			}
		} finally {
			await fixture.cleanup();
		}
	}, 120_000);

	test("rejects stale human decisions and cancellation without a successor launch", async () => {
		const fixture = cancellationProcessFixture();
		try {
			for (const action of ["cancel_then_decision", "decision_then_cancel"]) {
				const home = await fixture.create(true);
				await fixture.execute(home, action);
				const retained = await fixture.execute(home, "inspect");
				expect(retained).toMatchObject({ taskRows: 0, bindingRows: 0, attemptRows: 0, claimAvailable: false });
				expect(retained.state.status).toBe("canceled");
				const human = retained.state.steps.find((step) => step.nodeId === "human")!;
				expect(human.state).toBe(action === "decision_then_cancel" ? "succeeded" : "canceled");
				expect(human.output).toBe(action === "decision_then_cancel" ? "Accepted by fixture" : null);
			}
		} finally {
			await fixture.cleanup();
		}
	}, 120_000);
});
