import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import { flowLines } from "./flowLines.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ slug, name, description }) as FlowSummary;

test("a project with no flow prints no section", () => {
	expect(flowLines([])).toEqual([]);
});

test("names every flow with what it is for and the commands that run it", () => {
	expect(
		flowLines([flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")]).join(
			"\n",
		),
	).toBe(
		`## Flows

A flow is a saved set of agent steps that Trellis runs against your pull request. These flows apply to this project:

- review: Read the diff and report every fault.
- e2e: End to end

Read the list again with trellis flows list --ticket <ticket>.
Run the flows when you believe the work is complete, before you ask for review.
Pick every flow that fits your change. Start each one and wait for its result: trellis flows run <pr> --flow <slug>
trellis ready <pr> and trellis move <ticket> human-review accept the pull request once a flow run succeeds, or stops at a step that only a person answers. Until then they name the flows you can run.
When a flow run fails, fix the fault and run the flow again.
A flow run counts for the pull request. A later push keeps it.
A finding that a flow left stays open until you answer it, and an open finding holds the pull request back.
When no flow fits your change, say so in one step. Write the reason in the evidence document, then record it: trellis ready <pr> --flow-does-not-apply "<reason>"
Trellis keeps that reason with the pull request, and the person reads it beside your change.`,
	);
});
