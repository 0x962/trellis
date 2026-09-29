import {
	type ClassificationReceipt,
	type ClassificationResult,
	classificationStore,
} from "../../../db/queries/langflowExecution/classification.ts";
import { findPullRequestRow } from "../../findPullRequestRow.ts";
import type { ServiceCtx } from "../../support.ts";
import { type ClassificationDependencies, classifyReviewArea } from "../classifyReviewArea";
import { type ReviewGateResult, reviewGateResult } from "../reviewGateResult";

export type ReviewGateInput = {
	executionId: string;
	diffId: string;
	reviewedHead: string;
	publication: {
		publicationId: string;
		gates: ReadonlyArray<{ nodeId: string; reviewArea: "frontend" | "backend" }>;
	};
	gateNodeId: string;
};
export async function reviewGate(
	ctx: Pick<ServiceCtx, "newTx" | "log">,
	input: ReviewGateInput,
	store: Pick<typeof classificationStore, "claim" | "finish"> = classificationStore,
	deps?: ClassificationDependencies,
	lifecycle?: {
		afterValidatedResponse(receipt: ClassificationReceipt): Promise<void>;
	},
): Promise<ReviewGateResult> {
	const gate = input.publication.gates.find((gate) => gate.nodeId === input.gateNodeId)!;
	const claim = await ctx.newTx((tx) =>
		store.claim(tx, {
			binding: {
				executionId: input.executionId,
				publicationId: input.publication.publicationId,
				diffId: input.diffId,
				reviewedHead: input.reviewedHead,
			},
			ownerToken: crypto.randomUUID(),
			requestBytes: JSON.stringify({
				gates: input.publication.gates
					.map(({ nodeId, reviewArea }) => ({ nodeId, reviewArea }))
					.toSorted((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0)),
			}),
		}),
	);
	let receipt = claim.receipt;
	if (claim.acquired) {
		let outcome: ClassificationResult;
		let responseReceived = false;
		try {
			const pull = await ctx.newTx(async (tx) => {
				const row = await findPullRequestRow(tx, input.diffId);
				return { owner: row.owner, repo: row.repo, number: row.number, headSha: input.reviewedHead };
			});
			outcome = {
				state: "succeeded",
				relevance: await classifyReviewArea(
					ctx,
					{ executionId: input.executionId, gateKey: input.gateNodeId, pull },
					deps,
				),
			};
			responseReceived = true;
		} catch (cause) {
			outcome = { state: "failed", error: `Jev gate: ${cause instanceof Error ? cause.message : String(cause)}` };
		}
		receipt = await ctx.newTx((tx) =>
			store.finish(tx, { receiptId: receipt.receiptId, ownerToken: receipt.ownerToken, result: outcome }),
		);
		if (responseReceived) await lifecycle?.afterValidatedResponse(receipt);
	}
	const result = reviewGateResult(receipt, gate.reviewArea);
	ctx.log("flow.review-gate", {
		executionId: input.executionId,
		receiptId: receipt.receiptId,
		gateNodeId: input.gateNodeId,
		area: gate.reviewArea,
		state: result.state,
		decision: result.state === "succeeded" ? result.decision : null,
		failureKind: result.state === "failed" ? "classification_failed" : null,
	});
	return result;
}
