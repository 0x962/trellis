import { ORPCError } from "@orpc/server";
import type { FlowDocumentV1 } from "@trellis/api";
import { readDocumentAction, readDocumentSaveReceipt } from "../../../db/queries/langflowDocuments";
import type { Tx } from "../../../db/tx";

export type DocumentActionReceiptInput = { operation: "publish" | "convert" | "edit"; value: unknown };
export type DocumentActionReceipt =
	| { state: "completed"; requestId: string; document: FlowDocumentV1 }
	| { state: "pending" | "miss"; requestId: string };

export const documentIntentReceipt = async (
	tx: Tx,
	input: {
		operation: DocumentActionReceiptInput["operation"];
		flowId: string;
		requestId: string;
		requestBytes: Buffer;
	},
): Promise<DocumentActionReceipt> => {
	const conflict = (name: string) =>
		new ORPCError("FLOW_REQUEST_CONFLICT", {
			status: 409,
			defined: true,
			message: `This request ID already identifies different ${name} bytes.`,
			data: { requestId: input.requestId },
		});
	if (input.operation === "publish") {
		const previous = await readDocumentAction(tx, input);
		if (previous === null) return { state: "miss", requestId: input.requestId };
		if (previous.action !== "publish" || previous.requestBytes !== input.requestBytes.toString("utf8"))
			throw conflict("publication");
		return previous.document === null
			? { state: "pending", requestId: input.requestId }
			: { state: "completed", requestId: input.requestId, document: previous.document };
	}
	const previous = await readDocumentSaveReceipt(tx, input);
	if (previous === undefined) return { state: "miss", requestId: input.requestId };
	if (!previous.requestBytes.equals(input.requestBytes))
		throw conflict(input.operation === "convert" ? "conversion" : "edit");
	return { state: "completed", requestId: input.requestId, document: previous.receipt };
};
