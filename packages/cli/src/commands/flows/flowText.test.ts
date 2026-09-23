import { expect, test } from "bun:test";
import type { FlowExecutionRecord } from "@trellis/api";
import { flowRunText } from "./flowText.ts";

type Step = FlowExecutionRecord["state"]["steps"][number];

const step = (nodeId: string, state: Step["state"], error: string | null = null): Step =>
	({ nodeId, state, error }) as Step;

const record = (status: string, steps: Step[], error: string | null = null): FlowExecutionRecord =>
	({
		id: "01M35ST5T6DJAYQS7V2KBPK9K6",
		doc: {
			flow: { name: "Review" },
			nodes: [
				{ id: "read", title: "Read the diff" },
				{ id: "sign", title: "Sign it off" },
			],
		},
		state: { status, error, steps },
	}) as unknown as FlowExecutionRecord;

test("states the success in one sentence", () => {
	expect(flowRunText(record("succeeded", []), 131)).toBe("The Review flow succeeded on #131.\n");
});

test("names the step that failed and what it reported", () => {
	expect(flowRunText(record("failed", [step("read", "failed", "The patch was empty.")]), 131)).toBe(
		"The Review flow failed on #131 at the step Read the diff. The patch was empty.\n",
	);
});

test("falls back to the error of the run when no step carries one", () => {
	expect(flowRunText(record("failed", [], "Process timed out"), 131)).toBe(
		"The Review flow failed on #131. Process timed out\n",
	);
});

test("names the step that waits for a person", () => {
	expect(flowRunText(record("waiting", [step("sign", "waiting_human")]), 131)).toBe(
		"The Review flow waits for a person on #131 at the step Sign it off. Open the Flows tab of the pull request to answer it.\n",
	);
});

test("points at the runs list when the wait ran out", () => {
	expect(flowRunText(record("running", [step("read", "running")]), 131)).toBe(
		"The Review flow still runs on #131. Read its state with: trellis flows runs 131\n",
	);
});
