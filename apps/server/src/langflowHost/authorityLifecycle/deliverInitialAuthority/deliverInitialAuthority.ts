import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";
import type { createEngineClient } from "../../engineClient";

const ReceiptSchema = z.strictObject({
	version: z.literal(1),
	requestId: z.string().min(1),
	requestDigest: z.string(),
	originalAuthorityDigest: z.string(),
	successorAuthorityDigest: z.string(),
	successorCommitDigest: z.string(),
	state: z.literal("committed"),
});

export async function deliverInitialAuthority(input: {
	client: ReturnType<typeof createEngineClient>;
	requestBytes: string;
	signal: AbortSignal;
}) {
	const request = JSON.parse(input.requestBytes);
	const commit = JSON.parse(request.successorCommitBytes);
	const response = await input.client.request({
		method: "POST",
		path: "/trellis-v1/authority/recover-initial",
		body: input.requestBytes,
		signal: input.signal,
	});
	if (response.state !== "received" || response.status !== 200) return { state: "unknown" as const };
	const sourceBytes = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
	const receipt = ReceiptSchema.parse(JSON.parse(sourceBytes));
	if (
		receipt.requestId !== request.requestId ||
		receipt.requestDigest !== protocolDigest(input.requestBytes) ||
		receipt.originalAuthorityDigest !== protocolDigest(request.originalAuthorityBytes) ||
		receipt.successorAuthorityDigest !== protocolDigest(commit.authorityBytes) ||
		receipt.successorCommitDigest !== protocolDigest(request.successorCommitBytes)
	) throw new Error("initial_recovery_engine_receipt_conflict");
	return { state: "confirmed" as const, sourceBytes };
}
