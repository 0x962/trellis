import { expect, test } from "bun:test";
import { ObserverHarnessError } from "../sessionObserverHarness";
import type { IoCtx } from "../support.ts";
import { prepareSessionObserverGenerations } from "./index.ts";
import { fixture, observerId, runId } from "./testFixture";

for (const [dependency, operation] of [
	["ensureRun", "ensure-run"],
	["linkRun", "link-run"],
	["context", "read-context"],
	["generate", "generate-reply"],
	["saveSummary", "save-summary"],
	["rollover", "rollover-conversation"],
	["save", "save-update"],
] as const) {
	test(`records a safe diagnostic when ${operation} fails`, async () => {
		const { calls, deps } = fixture({ capacityOnFirst: dependency === "saveSummary" || dependency === "rollover" });
		if (dependency === "ensureRun" || dependency === "linkRun") {
			const claim = deps.claim;
			deps.claim = async (...args) => ({ ...(await claim(...args))!, observerRunId: null });
		}
		const records: unknown[] = [];
		deps[dependency] = async () => {
			throw new Error("private transcript and provider error");
		};
		const ctx = { log: (event: string, fields: unknown) => records.push({ event, fields }) } as unknown as IoCtx;
		const fail = deps.fail;
		deps.fail = async (...args) => {
			expect(records).toHaveLength(1);
			return fail(...args);
		};
		expect(await prepareSessionObserverGenerations(ctx, {}, deps)).toEqual({ checked: 1, saved: 0, failed: 1 });
		expect(records).toEqual([
			{
				event: "session-observer.generation-failed",
				fields: { runId, observerId, claimId: "claim-1", operation, errorCode: "CLAUDE_GENERATION_FAILED" },
			},
		]);
		expect(JSON.stringify({ records, failures: calls.fail })).not.toContain("private");
	});
}

test("retains the safe harness failure code in the diagnostic", async () => {
	const { deps } = fixture({
		generateError: new ObserverHarnessError("OBSERVER_MODEL_UNAVAILABLE", "The requested model is unavailable."),
	});
	const records: unknown[] = [];
	const ctx = { log: (_event: string, fields: unknown) => records.push(fields) } as unknown as IoCtx;
	await prepareSessionObserverGenerations(ctx, {}, deps);
	expect(records).toEqual([
		{
			runId,
			observerId,
			claimId: "claim-1",
			operation: "generate-reply",
			errorCode: "CLAUDE_MODEL_UNAVAILABLE",
		},
	]);
});
