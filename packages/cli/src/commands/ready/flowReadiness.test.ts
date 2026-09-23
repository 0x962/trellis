import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import {
	type FlowReadiness,
	flowReadiness,
	flowRunMissingLines,
	flowRunMissingSummary,
	flowWaivedLines,
} from "./flowReadiness.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ slug, name, description }) as FlowSummary;

const readiness = (runs: FlowReadiness["runs"]): FlowReadiness => ({
	flows: [flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")],
	runs,
	waived: null,
	satisfied: runs.some((run) => run.status === "succeeded"),
});

// Records the list input, so a test can state that the head filter reaches
// the server instead of the client.
const ref = { id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" };

const clientWith = (
	flows: FlowSummary[],
	records: Array<{ slug: string; name: string; status: string }>,
	waiver: { headSha: string; reason: string } | null = null,
) => {
	const sent: unknown[] = [];
	const client = {
		flows: { list: async () => flows },
		flowExecutions: {
			list: async (input: unknown) => {
				sent.push(input);
				return records.map((record) => ({
					doc: { flow: { slug: record.slug, name: record.name } },
					state: { status: record.status },
				}));
			},
		},
		pullRequests: { readFlowWaiver: async () => waiver },
	} as unknown as TrellisClient;
	return { client, sent };
};

test("asks for nothing when the server holds no flow", async () => {
	const { client } = clientWith([], []);

	expect(await flowReadiness(client, ref, "OP-74", "abc123")).toEqual({
		flows: [],
		runs: [],
		waived: null,
		satisfied: true,
	});
});

test("asks for nothing when no ticket links the pull request", async () => {
	const { client } = clientWith([flow("review", "Review", "")], []);

	expect((await flowReadiness(client, ref, null, "abc123")).satisfied).toBe(true);
});

test("asks the server for the runs of the current head only", async () => {
	const { client, sent } = clientWith([flow("review", "Review", "")], []);

	await flowReadiness(client, ref, "OP-74", "abc123");

	expect(sent).toEqual([{ ticket: "OP-74", headSha: "abc123" }]);
});

test("is satisfied by a run that succeeded", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "succeeded" }],
	);

	expect((await flowReadiness(client, ref, "OP-74", "abc123")).satisfied).toBe(true);
});

// A flow is machine review. A run that stopped and waits did not finish, so
// it answers nothing and the agent runs the flow again.
test("is not satisfied by a run that stopped and waits", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "waiting" }],
	);

	expect((await flowReadiness(client, ref, "OP-74", "abc123")).satisfied).toBe(false);
});

test("is not satisfied by a run that failed", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [{ slug: "review", name: "Review", status: "failed" }]);

	expect((await flowReadiness(client, ref, "OP-74", "abc123")).satisfied).toBe(false);
});

test("names every flow and its command when no flow ran", () => {
	const state = readiness([]);

	expect(flowRunMissingSummary(state, 131)).toBe("no flow ran on the current head");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    Pick the flows that fit this change and run each one:",
		"    review  Read the diff and report every fault.  trellis flows run 131 --flow review",
		"    e2e     End to end                             trellis flows run 131 --flow e2e",
		"    A flow that does not fit this change is answered in one step. Write the reason in the",
		"    evidence document, then record it here:",
		'      trellis ready 131 --flow-does-not-apply "<reason>"',
	]);
});

test("tells the agent to wait only while a run works on its own", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "running" }]);

	expect(flowRunMissingSummary(state, 131)).toBe("a flow still works. Wait for it, then run: trellis ready 131");
	expect(flowRunMissingLines(state, 131)).toEqual(["    The Review flow is still at work."]);
});

test("names the failed run and both ways out of it", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "failed" }]);

	expect(flowRunMissingSummary(state, 131)).toBe("no flow run on the current head finished");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    The Review flow failed. Fix the fault and run it again:",
		"      trellis flows run 131 --flow review",
		"    A flow that does not fit this change is answered in one step. Write the reason in the",
		"    evidence document, then record it here:",
		'      trellis ready 131 --flow-does-not-apply "<reason>"',
	]);
});

test("names a run that stopped and tells the agent to run the flow again", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "waiting" }]);

	expect(flowRunMissingSummary(state, 131)).toBe("no flow run on the current head finished");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    The Review flow stopped and did not finish. Fix the fault and run it again:",
		"      trellis flows run 131 --flow review",
		"    A flow that does not fit this change is answered in one step. Write the reason in the",
		"    evidence document, then record it here:",
		'      trellis ready 131 --flow-does-not-apply "<reason>"',
	]);
});

test("takes the agent's own sentence in place of a run", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [], {
		headSha: "abc123",
		reason: "This change edits only the README.",
	});

	const result = await flowReadiness(client, ref, "OP-74", "abc123");

	expect(result.waived).toBe("This change edits only the README.");
	expect(result.satisfied).toBe(true);
});

test("drops a sentence written about an older head", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [], { headSha: "older1", reason: "Docs only." });

	const result = await flowReadiness(client, ref, "OP-74", "abc123");

	expect(result.waived).toBeNull();
	expect(result.satisfied).toBe(false);
});

test("prints the agent's sentence for the person", () => {
	expect(flowWaivedLines({ ...readiness([]), waived: "This change edits only the README." })).toEqual([
		"  No flow fits this change, and the agent wrote why: This change edits only the README.",
	]);
	expect(flowWaivedLines(readiness([]))).toEqual([]);
});

test("names the one step that records a change no flow fits", () => {
	expect(flowRunMissingLines(readiness([]), 131).slice(-3)).toEqual([
		"    A flow that does not fit this change is answered in one step. Write the reason in the",
		"    evidence document, then record it here:",
		'      trellis ready 131 --flow-does-not-apply "<reason>"',
	]);
});
