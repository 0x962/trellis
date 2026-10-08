import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import { flowLines } from "./flowLines.ts";

const flow = (slug: string, name: string, description: string): FlowSummary =>
	({ id: `flow:${slug}`, slug, name, description }) as FlowSummary;

test("a project with no flow prints no section", () => {
	expect(flowLines([])).toEqual([]);
});

test("names the available flows without a second workflow guide", () => {
	expect(
		flowLines([flow("review", "Review", "Read the diff and report every fault."), flow("e2e", "End to end", "")]),
	).toEqual([
		"## Available flows",
		"",
		"- flow:review: review, Read the diff and report every fault.",
		"- flow:e2e: e2e, End to end",
	]);
});
