import { expect, test } from "bun:test";
import { PullRequestSummarySchema, PullRequestSummaryWriteInputSchema } from "./pullRequest.ts";

const input = {
	id: "01M3NZCHRB5K4NENJV9ZV6T4PB",
	headSha: "a".repeat(40),
	headline: `Save the ${"complete".repeat(30)} explanation.`,
	why: "The explanation preserves the full text.\n".repeat(100),
	watch: "Read the schema for the explanation.\n".repeat(100),
};

test("explanation inputs and outputs preserve text beyond the former limits", () => {
	expect(input.headline.length).toBeGreaterThan(200);
	expect(input.why.length).toBeGreaterThan(2000);
	expect(input.watch.length).toBeGreaterThan(2000);
	expect(PullRequestSummaryWriteInputSchema.parse(input)).toEqual(input);
	const { id, ...fields } = input;
	const summary = { pullRequestId: id, ...fields };
	expect(PullRequestSummarySchema.parse(summary)).toEqual(summary);
});

test("explanation fields remain required and nonempty", () => {
	for (const field of ["headline", "why", "watch"] as const) {
		expect(PullRequestSummaryWriteInputSchema.safeParse({ ...input, [field]: "" }).success).toBe(false);
		expect(PullRequestSummaryWriteInputSchema.safeParse({ ...input, [field]: undefined }).success).toBe(false);
	}
});

test("explanation head identifiers retain their existing length constraints", () => {
	for (const length of [40, 64]) {
		expect(PullRequestSummaryWriteInputSchema.parse({ ...input, headSha: "a".repeat(length) }).headSha).toBe(
			"a".repeat(length),
		);
	}
	for (const headSha of ["", "a".repeat(65)]) {
		expect(PullRequestSummaryWriteInputSchema.safeParse({ ...input, headSha }).success).toBe(false);
	}
});
