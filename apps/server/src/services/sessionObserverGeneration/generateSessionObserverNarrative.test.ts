import { expect, test } from "bun:test";
import { generateSessionObserverNarrative, type SessionObserverTurnInput } from "./generateSessionObserverNarrative.ts";

class CapacityError extends Error {
	readonly code = "OBSERVER_CONTEXT_CAPACITY";
}

test("uses separate delivery receipts for context summaries and the final narrative", async () => {
	const calls: SessionObserverTurnInput[] = [];
	const savedSummaries: string[] = [];
	const generate = async (input: SessionObserverTurnInput) => {
		calls.push(input);
		if (calls.length === 1) throw new CapacityError();
		return { text: calls.length === 2 ? "Saved context." : "Project account.", usageId: `usage-${calls.length}` };
	};

	const result = await generateSessionObserverNarrative(
		{
			messages: [{ role: "user", body: "A context that exceeds capacity." }],
			beforeNarrativeAfterSummary: async (summary, generations) => {
				savedSummaries.push(summary.body);
				expect(generations.map((generation) => generation.usageId)).toEqual(["usage-2"]);
			},
		},
		generate,
	);

	expect(calls.map((call) => call.deliveryId)).toEqual(["narrative", "summary-0", "narrative-after-summary"]);
	expect(result.incrementalSummary?.body).toContain("Saved context.");
	expect(savedSummaries).toHaveLength(1);
	expect(calls.at(-1)?.deliveryId).toBe("narrative-after-summary");
	expect(result.summaryGenerations.map((generation) => generation.usageId)).toEqual(["usage-2"]);
	expect(result.generation).toMatchObject({ text: "Project account.", usageId: "usage-3" });
});

test("splits a summary turn without changing its immutable delivery identity", async () => {
	const calls: SessionObserverTurnInput[] = [];
	const generate = async (input: SessionObserverTurnInput) => {
		calls.push(input);
		if (input.deliveryId === "narrative" || input.deliveryId === "summary-0") throw new CapacityError();
		return { text: input.deliveryId };
	};

	const result = await generateSessionObserverNarrative(
		{ messages: [{ role: "user", body: "A long observer context." }] },
		generate,
	);

	expect(calls.map((call) => call.deliveryId)).toEqual([
		"narrative",
		"summary-0",
		"summary-0-left",
		"summary-0-right",
		"narrative-after-summary",
	]);
	expect(result.incrementalSummary?.body).toContain("summary-0-left");
	expect(result.incrementalSummary?.body).toContain("summary-0-right");
});
