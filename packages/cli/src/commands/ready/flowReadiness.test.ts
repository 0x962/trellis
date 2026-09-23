import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { type FlowReadiness, flowMissingLines, flowMissingSummary, flowReadiness } from "./flowReadiness.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ slug, name, description }) as FlowSummary;

const readiness = (runs: FlowReadiness["runs"]): FlowReadiness => ({
	flows: [flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")],
	runs,
	satisfied: runs.some((run) => run.status === "succeeded"),
});

const clientWith = (
	flows: FlowSummary[],
	records: Array<{ headSha: string | null; slug: string; name: string; status: string }>,
): TrellisClient =>
	({
		flows: { list: async () => flows },
		flowExecutions: {
			list: async () =>
				records.map((record) => ({
					headSha: record.headSha,
					doc: { flow: { slug: record.slug, name: record.name } },
					state: { status: record.status },
				})),
		},
	}) as unknown as TrellisClient;

test("asks for nothing when the server holds no flow", async () => {
	const result = await flowReadiness(clientWith([], []), "OP-74", "abc123");

	expect(result).toEqual({ flows: [], runs: [], satisfied: true });
});

test("asks for nothing when no ticket links the pull request", async () => {
	const result = await flowReadiness(clientWith([flow("review", "Review", "")], []), null, "abc123");

	expect(result.satisfied).toBe(true);
});

test("counts only a run that names the current head", async () => {
	const result = await flowReadiness(
		clientWith(
			[flow("review", "Review", "")],
			[
				{ headSha: "older1", slug: "review", name: "Review", status: "succeeded" },
				{ headSha: "abc123", slug: "review", name: "Review", status: "failed" },
			],
		),
		"OP-74",
		"abc123",
	);

	expect(result.runs).toEqual([{ slug: "review", name: "Review", status: "failed" }]);
	expect(result.satisfied).toBe(false);
});

test("is satisfied by one run of the current head that succeeded", async () => {
	const result = await flowReadiness(
		clientWith(
			[flow("review", "Review", "")],
			[{ headSha: "abc123", slug: "review", name: "Review", status: "succeeded" }],
		),
		"OP-74",
		"abc123",
	);

	expect(result.satisfied).toBe(true);
});

test("names every flow and its command when no flow ran", () => {
	const state = readiness([]);

	expect(flowMissingSummary(state, 131)).toBe("no flow ran on the current head");
	expect(flowMissingLines(state, 131)).toEqual([
		"    Pick the flows that fit this change and run each one:",
		"    review  Read the diff and report every fault.  trellis flows run 131 --flow review",
		"    e2e     End to end                             trellis flows run 131 --flow e2e",
	]);
});

test("tells the agent to wait while a run is live", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "running" }]);

	expect(flowMissingSummary(state, 131)).toBe("a flow still runs; wait for it, then run: trellis ready 131");
	expect(flowMissingLines(state, 131)).toEqual(["    The Review flow is running."]);
});

test("names the failed run and both ways out of it", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "failed" }]);

	expect(flowMissingSummary(state, 131)).toBe("every flow run on the current head ended without success");
	expect(flowMissingLines(state, 131)).toEqual([
		"    The Review flow failed. Fix the fault and run it again:",
		"      trellis flows run 131 --flow review",
		"    Or write in the evidence document why this flow does not apply to the change.",
	]);
});
