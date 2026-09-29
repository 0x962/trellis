import { expect, test } from "bun:test";
import { AgentAnswerInputSchema } from "./sessionActivity.ts";

test("preserves a complete multibyte answer and its request identity", () => {
	const input = {
		id: "01M3NZCJD83M52F4F7FD7S3YSX",
		attemptId: "attempt",
		requestId: "request",
		answers: [{ questionId: "question", freeText: `  ${"東京 café e\u0301\n".repeat(1_000)}  ` }],
		cancel: false,
	};
	expect(AgentAnswerInputSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
});

test("rejects invalid answer types and missing request identity", () => {
	const input = {
		id: "01M3NZCJD83M52F4F7FD7S3YSX",
		attemptId: "attempt",
		requestId: "request",
		answers: [{ questionId: "question", freeText: "answer" }],
		cancel: false,
	};
	expect(AgentAnswerInputSchema.safeParse({ ...input, requestId: "" }).success).toBe(false);
	expect(
		AgentAnswerInputSchema.safeParse({ ...input, answers: [{ questionId: "question", freeText: 500 }] }).success,
	).toBe(false);
});
