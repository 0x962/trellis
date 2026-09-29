import { and, eq } from "drizzle-orm";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function readReservation(tx: Tx, input: { executionId: string; stepId: string }) {
	const [row] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(eq(langflowNativeHandles.executionId, input.executionId), eq(langflowNativeHandles.stepId, input.stepId)),
		);
	if (!row) throw new Error("native_reservation_not_found");
	return row;
}
