import { isDeepStrictEqual } from "node:util";
import type { RuntimeCaptureFinalizationReceipt } from "@trellis/runtime-protocol";
import { protocolDigest } from "../../../langflowContracts";
import { RuntimeCaptureRequestSchema, RuntimeFinalizationSchema } from "../runtimeFinalizationSchema";

export function parseRuntimeFinalization(request: unknown, value: unknown) {
	if (value === null) throw new Error("paired_runtime_finalization_unverified");
	const expected = RuntimeCaptureRequestSchema.parse(request);
	const finalization = RuntimeFinalizationSchema.parse(value);
	const rawReceipt: unknown = JSON.parse(finalization.receiptBytes);
	const receipt = RuntimeFinalizationSchema.shape.receipt.parse(rawReceipt);
	const digest = protocolDigest(JSON.stringify(request));
	if (
		!isDeepStrictEqual(receipt, finalization.receipt) ||
		!isDeepStrictEqual(receipt.request, expected) ||
		receipt.requestSha256 !== digest ||
		protocolDigest(JSON.stringify((rawReceipt as RuntimeCaptureFinalizationReceipt).request)) !== digest
	)
		throw new Error("paired_runtime_finalization_mismatch");
	return finalization;
}
