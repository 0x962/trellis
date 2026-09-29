import { and, eq, or } from "drizzle-orm";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { NativeRequestV1Schema, protocolDigest, readProtocolBytes } from "../../../langflowContracts";

export async function findNativeRequest(tx: Tx, input: { requestBytes: string }) {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const semanticKey = JSON.stringify([
		request.nodeId,
		request.parentOccurrenceKey,
		request.phase,
		request.iterationPath.map((value) => [value.loopNodeId, value.round]),
	]);
	const rows = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, request.executionId),
				or(
					eq(langflowNativeHandles.semanticDigest, protocolDigest(semanticKey)),
					eq(langflowNativeHandles.requestId, request.requestId),
					eq(langflowNativeHandles.occurrenceDigest, protocolDigest(request.occurrenceKey)),
				),
			),
		);
	if (rows.length > 1 || rows.some((row) => row.requestBytes !== input.requestBytes))
		throw new Error("identity_conflict");
	return rows[0] ?? null;
}
