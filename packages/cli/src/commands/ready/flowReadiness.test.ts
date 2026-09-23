import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import {
	type FlowReadiness,
	flowReadiness,
	flowRunMissingLines,
	flowRunMissingSummary,
	flowRunWaitingLines,
} from "./flowReadiness.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ slug, name, description }) as FlowSummary;

const readiness = (runs: FlowReadiness["runs"]): FlowReadiness => ({
	flows: [flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")],
	runs,
	satisfied: runs.some((run) => run.status === "succeeded" || run.status === "waiting"),
});

// Records the list input, so a test can state that the head filter reaches
// the server instead of the client.
const clientWith = (flows: FlowSummary[], records: Array<{ slug: string; name: string; status: string }>) => {
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
	} as unknown as TrellisClient;
	return { client, sent };
};

test("asks for nothing when the server holds no flow", async () => {
	const { client } = clientWith([], []);

	expect(await flowReadiness(client, "OP-74", "abc123")).toEqual({ flows: [], runs: [], satisfied: true });
});

test("asks for nothing when no ticket links the pull request", async () => {
	const { client } = clientWith([flow("review", "Review", "")], []);

	expect((await flowReadiness(client, null, "abc123")).satisfied).toBe(true);
});

test("asks the server for the runs of the current head only", async () => {
	const { client, sent } = clientWith([flow("review", "Review", "")], []);

	await flowReadiness(client, "OP-74", "abc123");

	expect(sent).toEqual([{ ticket: "OP-74", headSha: "abc123" }]);
});

test("is satisfied by a run that succeeded", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "succeeded" }],
	);

	expect((await flowReadiness(client, "OP-74", "abc123")).satisfied).toBe(true);
});

test("is satisfied by a run that waits for a person", async () => {
	const { client } = clientWith(
		[flow("review", "Review", "")],
		[{ slug: "review", name: "Review", status: "waiting" }],
	);

	expect((await flowReadiness(client, "OP-74", "abc123")).satisfied).toBe(true);
});

test("is not satisfied by a run that failed", async () => {
	const { client } = clientWith([flow("review", "Review", "")], [{ slug: "review", name: "Review", status: "failed" }]);

	expect((await flowReadiness(client, "OP-74", "abc123")).satisfied).toBe(false);
});

test("names every flow and its command when no flow ran", () => {
	const state = readiness([]);

	expect(flowRunMissingSummary(state, 131)).toBe("no flow ran on the current head");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    Pick the flows that fit this change and run each one:",
		"    review  Read the diff and report every fault.  trellis flows run 131 --flow review",
		"    e2e     End to end                             trellis flows run 131 --flow e2e",
	]);
});

test("tells the agent to wait only while a run works on its own", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "running" }]);

	expect(flowRunMissingSummary(state, 131)).toBe("a flow still works. Wait for it, then run: trellis ready 131");
	expect(flowRunMissingLines(state, 131)).toEqual(["    The Review flow is still at work."]);
});

test("names the failed run and both ways out of it", () => {
	const state = readiness([{ slug: "review", name: "Review", status: "failed" }]);

	expect(flowRunMissingSummary(state, 131)).toBe("every flow run on the current head ended without success");
	expect(flowRunMissingLines(state, 131)).toEqual([
		"    The Review flow failed. Fix the fault and run it again:",
		"      trellis flows run 131 --flow review",
		"    Or write in the evidence document why this flow does not apply to the change.",
	]);
});

test("tells the person which flow waits for them", () => {
	expect(flowRunWaitingLines(readiness([{ slug: "review", name: "Review", status: "waiting" }]))).toEqual([
		"  The Review flow waits for you. Answer its open step in the Flows tab of the pull request.",
	]);
});

test("says nothing to the person when no run waits", () => {
	expect(flowRunWaitingLines(readiness([{ slug: "review", name: "Review", status: "succeeded" }]))).toEqual([]);
});
