import { expect, test } from "bun:test";
import {
	FlowExecutionDecisionInputSchema,
	FlowExecutionListInputSchema,
	FlowExecutionStartInputSchema,
} from "./flowExecution.ts";

const id = "01J9Z0000000000000000000N1";

test("accepts repeat reasons, action keys, and human outputs above the former limits", () => {
	expect(
		FlowExecutionStartInputSchema.safeParse({
			flow: "review",
			ticket: "TRL-710",
			allowRepeat: true,
			repeatReason: "r".repeat(10_001),
			requestId: "8100dfd4-8c7b-4f60-932e-60888a01f901",
			expectedVersion: 1,
		}).success,
	).toBe(true);
	expect(
		FlowExecutionDecisionInputSchema.safeParse({
			id,
			key: "k".repeat(100_001),
			approved: true,
			output: "o".repeat(512 * 1024 + 1),
			expectedRevision: 1,
		}).success,
	).toBe(true);
});

test("retains required values, commit format, and list pagination", () => {
	expect(
		FlowExecutionStartInputSchema.safeParse({
			flow: "review",
			ticket: "TRL-710",
			repeatReason: " ",
			requestId: "8100dfd4-8c7b-4f60-932e-60888a01f901",
			expectedVersion: 1,
		}).success,
	).toBe(false);
	expect(
		FlowExecutionStartInputSchema.safeParse({
			flow: "review",
			ticket: "TRL-710",
			headSha: "a".repeat(65),
			requestId: "8100dfd4-8c7b-4f60-932e-60888a01f901",
			expectedVersion: 1,
		}).success,
	).toBe(false);
	expect(
		FlowExecutionDecisionInputSchema.safeParse({
			id,
			key: "",
			approved: true,
			output: "",
			expectedRevision: 1,
		}).success,
	).toBe(false);
	expect(FlowExecutionListInputSchema.safeParse({ limit: 501 }).success).toBe(false);
});
