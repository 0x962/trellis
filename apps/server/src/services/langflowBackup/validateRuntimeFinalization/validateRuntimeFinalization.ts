import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";
import { WorkspaceBindingSchema } from "../workspaceArchive/contracts/contracts";

const requestSchema = WorkspaceBindingSchema.omit({ workspaces: true, roots: true });
const receiptSchema = z.strictObject({
	schemaVersion: z.literal(1),
	kind: z.literal("trellis-runtime-capture-finalization"),
	request: requestSchema,
	requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
	outcome: z.enum(["committed", "abandoned"]),
	finalizedAt: z.iso.datetime(),
});
const finalizationSchema = z.strictObject({ receipt: receiptSchema, receiptBytes: z.string() });

export function validateRuntimeFinalization(request: unknown, value: unknown) {
	if (value === null) throw new Error("paired_runtime_finalization_unverified");
	const expected = requestSchema.parse(request);
	const finalization = finalizationSchema.parse(value);
	const rawReceipt: unknown = JSON.parse(finalization.receiptBytes);
	const receipt = receiptSchema.parse(rawReceipt);
	if (
		!isDeepStrictEqual(receipt, finalization.receipt) ||
		!isDeepStrictEqual(receipt.request, expected) ||
		receipt.requestSha256 !== protocolDigest(JSON.stringify(request)) ||
		receipt.outcome !== "committed"
	)
		throw new Error("paired_runtime_finalization_mismatch");
	return finalization;
}
