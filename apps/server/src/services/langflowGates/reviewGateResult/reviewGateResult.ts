import type { ClassificationReceipt } from "../../../db/queries/langflowExecution/classification.ts";

export type ReviewGateResult =
	| { state: "pending"; receipt: ClassificationReceipt }
	| { state: "failed"; receipt: ClassificationReceipt; error: string }
	| { state: "succeeded"; receipt: ClassificationReceipt; decision: "yes" | "no"; output: string };

export function reviewGateResult(receipt: ClassificationReceipt, reviewArea: "frontend" | "backend"): ReviewGateResult {
	if (receipt.state === "claimed") return { state: "pending", receipt };
	if (receipt.state === "failed") return { state: "failed", receipt, error: receipt.error! };
	const { frontend, backend } = receipt.relevance!;
	return {
		state: "succeeded",
		receipt,
		decision: receipt.relevance![reviewArea] ? "yes" : "no",
		output: JSON.stringify({ frontend, backend }),
	};
}
