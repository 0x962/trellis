import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";
import { createEngineClient, type EngineClientOptions } from "../../../langflowHost";

export const EngineCancellationStatusSchema = z.enum(["queued", "in_progress", "suspended", "completed", "failed", "cancelled", "timed_out"]);
export const terminalCancellationStatuses = ["completed", "failed", "cancelled", "timed_out"] as const;
export type EngineCancellationStatus = z.infer<typeof EngineCancellationStatusSchema>;

export const EngineCancellationReceiptSchema = z.strictObject({
	version: z.literal(1),
	receiptId: z.uuid(),
	requestId: z.uuid(),
	executionId: z.string().min(1),
	engineJobId: z.uuid(),
	cancelIntentDigest: z.string().regex(/^[a-f0-9]{64}$/),
	acceptedAt: z.iso.datetime(),
});
export type EngineCancellationReceipt = z.infer<typeof EngineCancellationReceiptSchema>;
export type CancellationRequest = {
	executionId: string;
	publicationId: string;
	engineJobId: string;
	requestId: string;
	cancelIntentBytes: string;
	authorityBytes: string;
};
export type CancellationDelivery =
	| { state: "confirmed"; receipt: EngineCancellationReceipt; engineStatus: EngineCancellationStatus }
	| { state: "unknown" }
	| { state: "failed"; status: number };

export function cancellationEngine(options: EngineClientOptions) {
	const client = createEngineClient(options);
	return {
		async cancel(input: CancellationRequest, signal: AbortSignal): Promise<CancellationDelivery> {
			const response = await client.request({
				method: "POST",
				path: "/trellis-v1/cancellation",
				body: JSON.stringify(input),
				signal,
			});
			if (response.state === "unknown") return response;
			if (response.status !== 200) return { state: "failed", status: response.status };
			const result = z.strictObject({
				receipt: EngineCancellationReceiptSchema,
				engineStatus: EngineCancellationStatusSchema,
			}).parse(JSON.parse(new TextDecoder().decode(response.bytes)));
			if (
				result.receipt.requestId !== input.requestId ||
				result.receipt.executionId !== input.executionId ||
				result.receipt.engineJobId !== input.engineJobId ||
				result.receipt.cancelIntentDigest !== protocolDigest(input.cancelIntentBytes)
			) throw new Error("cancellation_receipt_conflict");
			return { state: "confirmed", ...result };
		},
	};
}
