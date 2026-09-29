import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import {
	type ClassificationBinding,
	type ClassificationReceipt,
	type ClassificationResult,
	langflowClassifications as table,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
import { readProjection } from "./projections";

export type { ClassificationBinding, ClassificationReceipt, ClassificationResult };

async function read(tx: Tx, input: { executionId: string }) {
	const [row] = await tx.select().from(table).where(eq(table.executionId, input.executionId));
	return row?.receipt ?? null;
}
async function claim(tx: Tx, input: { binding: ClassificationBinding; ownerToken: string; requestBytes: string }) {
	const execution = await lockExecution(tx, input.binding);
	const existing = await read(tx, input.binding);
	if (existing) {
		if (!isDeepStrictEqual(existing.binding, input.binding) || existing.requestBytes !== input.requestBytes)
			throw new Error("classification_conflict");
		return { receipt: existing, acquired: false };
	}
	if (
		execution.cancelIntent ||
		execution.publicationId !== input.binding.publicationId ||
		execution.diffId !== input.binding.diffId ||
		execution.reviewedHead !== input.binding.reviewedHead
	)
		throw new Error("classification_conflict");
	const projection = await readProjection(tx, input.binding);
	if (projection && ["succeeded", "failed", "canceled"].includes(projection.view.status))
		throw new Error("execution_terminal");
	const receipt: ClassificationReceipt = {
		receiptId: ulid(),
		...input,
		state: "claimed",
		relevance: null,
		error: null,
	};
	await tx.insert(table).values({ receiptId: receipt.receiptId, executionId: input.binding.executionId, receipt });
	return { receipt, acquired: true };
}
async function finish(tx: Tx, input: { receiptId: string; ownerToken: string; result: ClassificationResult }) {
	const [identity] = await tx.select().from(table).where(eq(table.receiptId, input.receiptId));
	const execution = await lockExecution(tx, { executionId: identity!.executionId });
	const receipt = (await read(tx, { executionId: identity!.executionId }))!;
	if (receipt.ownerToken !== input.ownerToken) throw new Error("classification_owner_conflict");
	if (receipt.state !== "claimed") return receipt;
	const projection = await readProjection(tx, { executionId: identity!.executionId });
	const result =
		execution.cancelIntent || (projection && ["succeeded", "failed", "canceled"].includes(projection.view.status))
			? { state: "failed" as const, error: "Execution ended before classification completed." }
			: input.result;
	const saved: ClassificationReceipt = {
		...receipt,
		state: result.state,
		relevance: result.state === "succeeded" ? result.relevance : null,
		error: result.state === "failed" ? result.error : null,
	};
	await tx
		.update(table)
		.set({ receipt: saved })
		.where(and(eq(table.receiptId, input.receiptId), eq(table.executionId, execution.executionId)));
	return saved;
}
async function interrupt(tx: Tx, input: { executionId: string; ownerToken: string; error: string }) {
	await lockExecution(tx, input);
	const receipt = (await read(tx, input))!;
	return finish(tx, {
		receiptId: receipt.receiptId,
		ownerToken: input.ownerToken,
		result: { state: "failed", error: input.error },
	});
}
export const classificationStore = { claim, finish, read, interrupt };
