import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import { flowLines } from "./flowLines.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ slug, name, description }) as FlowSummary;

test("a server with no flow prints no section", () => {
	expect(flowLines([])).toEqual([]);
});

test("names every flow with what it is for and the commands that run it", () => {
	expect(
		flowLines([flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")]).join(
			"\n",
		),
	).toBe(
		`## Flows

A flow is a saved set of agent steps that Trellis runs against your pull request. These flows exist:

- review: Read the diff and report every fault.
- e2e: End to end

Read the list again with trellis flows list.
Pick every flow that fits your change. Start each one and wait for its result: trellis flows run <pr> --flow <slug>
trellis ready <pr> exits with code 1 until a flow run of the current head succeeds, or stops at a step that only a person answers. It names the flows you can run.
When a flow run fails, fix the fault and run the flow again, or write in the evidence document why the flow does not apply.`,
	);
});
