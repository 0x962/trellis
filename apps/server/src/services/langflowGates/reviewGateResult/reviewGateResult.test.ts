import { expect, test } from "bun:test";
import type { ClassificationReceipt } from "../../../db/queries/langflowExecution/classification.ts";
import { reviewGateResult } from "./reviewGateResult.ts";

const receipt: ClassificationReceipt = {
	receiptId: "classification",
	binding: { executionId: "execution", publicationId: "publication", diffId: "diff", reviewedHead: "reviewed" },
	ownerToken: "owner",
	requestBytes: "request",
	state: "succeeded",
	relevance: { backend: false, frontend: true },
	error: null,
};

test("the archived area determines the decision and output has stable bytes", () => {
	expect(reviewGateResult(receipt, "frontend")).toEqual({
		state: "succeeded",
		receipt,
		decision: "yes",
		output: '{"frontend":true,"backend":false}',
	});
	expect(reviewGateResult(receipt, "backend")).toEqual({
		state: "succeeded",
		receipt,
		decision: "no",
		output: '{"frontend":true,"backend":false}',
	});
});

test("a pending or failed receipt supplies no decision or output", () => {
	const pending = { ...receipt, state: "claimed" as const, relevance: null };
	const failed = { ...pending, state: "failed" as const, error: "Jev gate: interrupted" };
	expect(reviewGateResult(pending, "frontend")).toEqual({ state: "pending", receipt: pending });
	expect(reviewGateResult(failed, "frontend")).toEqual({ state: "failed", receipt: failed, error: failed.error });
});
