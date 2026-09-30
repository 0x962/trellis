import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import {
	type FlowReadiness,
	flowReadiness,
	flowRunMissingLines,
	flowRunMissingSummary,
	flowSkippedLines,
	flowWaivedLines,
} from "./flowReadiness.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ id: `flow:${slug}`, slug, name, description }) as FlowSummary;

const readiness = (runs: FlowReadiness["runs"]): FlowReadiness => ({
	flows: [flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")],
	runs,
	waived: null,
	skipped: null,
	satisfied: runs.some((run) => run.status === "succeeded"),
});

// The pull request every test reads.
const ref = { id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" };

const clientWith = (
	flows: FlowSummary[],
	records: Array<{ slug: string; name: string; status: string; flowId?: string }>,
	waiver: { headSha: string; reason: string } | null = null,
) => {
	const sent: unknown[] = [];
	const asked: unknown[] = [];
	const client = {
		flows: {
			list: async (input: unknown) => {
				asked.push(input);
				return flows;
			},
		},
		flowExecutions: {
			list: async (input: unknown) => {
				sent.push(input);
				const offset = (input as { offset?: number }).offset ?? 0;
				return records.slice(offset, offset + 500).map((record) => ({
					flowId: record.flowId ?? `flow:${record.slug}`,
					doc: { flow: { slug: record.slug, name: record.name } },
					state: { status: record.status },
				}));
			},
		},
		pullRequests: { readFlowWaiver: async () => waiver },
	} as unknown as TrellisClient;
	return { client, sent, asked };
};

test("asks for nothing when the project holds no flow", async () => {
	const { client } = clientWith([], []);

	expect(await flowReadiness(client, ref, "OP-74")).toEqual({
		flows: [],
		runs: [],
		waived: null,
		skipped: "no-flow",
		satisfied: true,
	});
});

test("asks for nothing when no ticket links the pull request", async () => {
	const { client, asked } = clientWith([flow("review", "Review", "")], []);

	expect((await flowReadiness(client, ref, null)).satisfied).toBe(true);
	expect(asked).toEqual([]);
});

test("asks the server for the flows of the ticket's project only", async () => {
	const { client, asked } = clientWith([flow("review", "Review", "")], []);

	await flowReadiness(client, ref, "OP-74");

	expect(asked).toEqual([{ ticket: "OP-74" }]);
});

test("asks the server for every run of the diff", async () => {
	const { client, sent } = clientWith([flow("review", "Review", "")], []);

	await flowReadiness(client, ref, "OP-74");

	expect(sent).toEqual([{ diffId: ref.id, limit: 500, offset: 0 }]);
});

test("is satisfied by a run that succeeded", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "succeeded" }],
	);

	expect((await flowReadiness(client, ref, "OP-74")).satisfied).toBe(true);
});

test("is not satisfied by a run that stopped and waits", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "waiting" }],
	);

	expect((await flowReadiness(client, ref, "OP-74")).satisfied).toBe(false);
});

test("is not satisfied by a run that failed", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [{ slug: "review", name: "Review", status: "failed" }]);

	expect((await flowReadiness(client, ref, "OP-74")).satisfied).toBe(false);
});

test("names every flow and its command when no flow ran", () => {
	const state = readiness([]);

	expect(flowRunMissingSummary(state, 131)).toBe("no flow ran for this pull request");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    Pick the flows that fit this change and run each one:",
		"    review  Read the diff and report every fault.  trellis flow start review --diff 131",
		"    e2e     End to end                             trellis flow start e2e --diff 131",
		"    A flow that does not fit this change is answered in one step. Write the reason in the",
		"    evidence document, then record it here:",
		'      trellis diff set-state 131 ready --flow-does-not-apply "<reason>"',
	]);
});

test("tells the agent to wait only while a run works on its own", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "running" }]);

	expect(flowRunMissingSummary(state, 131)).toBe(
		"a flow still works. Wait for it, then run: trellis diff set-state 131 ready",
	);
	expect(flowRunMissingLines(state, 131)).toEqual(["    The Review flow is still at work."]);
});

test("only an execution error recommends another start", () => {
	const failed = readiness([{ slug: "review", name: "Review", status: "failed", failureKind: "error" }]);
	expect(flowRunMissingLines(failed, 131)).toEqual([
		"    The Review flow ended with an execution error. Fix the cause and start it again:",
		"      trellis flow start review --diff 131",
	]);
	for (const status of ["failed", "waiting", "canceled"]) {
		const feedback = readiness([{ slug: "review", name: "Review", status, failureKind: "feedback" }]);
		expect(flowRunMissingLines(feedback, 131).join("\n")).not.toContain("trellis flow start");
	}
});

test("takes the agent's own sentence in place of a run", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [], {
		headSha: "abc123",
		reason: "This change edits only the README.",
	});

	const result = await flowReadiness(client, ref, "OP-74");

	expect(result.waived).toBe("This change edits only the README.");
	expect(result.satisfied).toBe(true);
});

test("keeps the sentence after a push", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [], { headSha: "older1", reason: "Docs only." });

	const result = await flowReadiness(client, ref, "OP-74");

	expect(result.waived).toBe("Docs only.");
	expect(result.satisfied).toBe(true);
});

test("says why it asked for no flow run", () => {
	expect(flowSkippedLines({ ...readiness([]), skipped: "no-flow" })).toEqual([
		"  No flow applies to the project of this pull request, so Trellis asked for no flow run.",
	]);
	expect(flowSkippedLines({ ...readiness([]), skipped: "no-ticket" })).toEqual([
		"  No ticket links this pull request, so Trellis asked for no flow run.",
	]);
	expect(flowSkippedLines(readiness([]))).toEqual([]);
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
		'      trellis diff set-state 131 ready --flow-does-not-apply "<reason>"',
	]);
});

test("a flow rename preserves its completed review", async () => {
	const { client } = clientWith(
		[{ ...flow("renamed", "Renamed review", ""), id: "flow:original" }],
		[{ slug: "original", name: "Original review", status: "succeeded", flowId: "flow:original" }],
	);
	expect((await flowReadiness(client, ref, "DEMO-1")).satisfied).toBe(true);
});

test("reads a completed review beyond the first page", async () => {
	const records = Array.from({ length: 500 }, () => ({ slug: "review", name: "Review", status: "failed" }));
	records.push({ slug: "review", name: "Review", status: "succeeded" });
	const { client, sent } = clientWith([flow("review", "Review", "")], records);
	expect((await flowReadiness(client, ref, "DEMO-1")).satisfied).toBe(true);
	expect(sent).toEqual([
		{ diffId: ref.id, limit: 500, offset: 0 },
		{ diffId: ref.id, limit: 500, offset: 500 },
	]);
});

test("an older error does not recommend a repeat of the active run", () => {
	const state = readiness([
		{ slug: "review", name: "Review", status: "running" },
		{ slug: "review", name: "Review", status: "failed", failureKind: "error" },
	]);
	expect(flowRunMissingLines(state, 131)).toEqual(["    The Review flow is still at work."]);
});
