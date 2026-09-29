import { expect, test } from "bun:test";
import request from "./fixtures/native-request.json";
import result from "./fixtures/native-result.json";
import {
	EventReplayRequestV1Schema,
	GroupDeadlineV1Schema,
	NativeRequestV1Schema,
	NativeResultV1Schema,
	protocolDigest,
} from "./index";

test("references, rounds, and item arrays exceed the former application ceilings", () => {
	const input = {
		...NativeRequestV1Schema.parse(request),
		occurrenceKey: `occurrence-${"x".repeat(4096)}`,
		iterationPath: [{ loopNodeId: "outer", round: 51 }],
		inputReceiptIds: Array.from({ length: 2001 }, (_, index) => `receipt-${index}`),
	};
	expect(NativeRequestV1Schema.parse(input)).toEqual(input);
	expect(
		EventReplayRequestV1Schema.parse({ version: 1, executionId: "execution-1", afterSeq: 0, limit: 1001 }).limit,
	).toBe(1001);
});

test("explicit group budgets can exceed one day", () => {
	const deadline = {
		deadlineId: "deadline-1",
		groupOccurrenceKey: "group-1",
		budgetMs: 172_800_000,
		launchedAt: "2026-09-29T06:00:00.000Z",
		deadlineAt: "2026-10-01T06:00:00.000Z",
		launchReceiptId: "launch-1",
	};
	expect(GroupDeadlineV1Schema.parse(deadline)).toEqual(deadline);
});

test("large output retains exact bytes while required formats still reject invalid values", () => {
	const output = "result\n".repeat(20_000);
	expect(NativeResultV1Schema.parse({ ...result, output, outputHash: protocolDigest(output) }).output).toBe(output);
	expect(NativeResultV1Schema.safeParse({ ...result, outputHash: "abc" }).success).toBe(false);
	expect(NativeRequestV1Schema.safeParse({ ...request, requestId: "not-a-uuid" }).success).toBe(false);
	expect(
		EventReplayRequestV1Schema.safeParse({ version: 1, executionId: "execution-1", afterSeq: 0, limit: 0 }).success,
	).toBe(false);
});
