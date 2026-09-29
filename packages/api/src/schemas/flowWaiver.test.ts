import { expect, test } from "bun:test";
import { PullRequestFlowWaiverWriteInputSchema } from "./flowWaiver.ts";

test("accepts a waiver reason above the former limit", () => {
	expect(
		PullRequestFlowWaiverWriteInputSchema.safeParse({
			id: "01J9Z0000000000000000000N1",
			headSha: "a".repeat(64),
			reason: "r".repeat(2001),
		}).success,
	).toBe(true);
});

test("retains the required reason and commit range", () => {
	expect(
		PullRequestFlowWaiverWriteInputSchema.safeParse({
			id: "01J9Z0000000000000000000N1",
			headSha: "a".repeat(65),
			reason: " ",
		}).success,
	).toBe(false);
});
