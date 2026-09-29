import { z } from "zod";
import type { createEngineClient } from "../../../langflowHost";

const proof = z.strictObject({ engineVertexId: z.string(), requestBytes: z.string(), waitBytes: z.string() });
export const ReviewVisitProofSchema = z.strictObject({
	requestBytes: z.string(), engineVertexId: z.string(), visits: z.array(proof),
});
export type ReviewVisitProof = z.infer<typeof ReviewVisitProofSchema>;

export function reviewGateEngine(client: Pick<ReturnType<typeof createEngineClient>, "request">, signal: AbortSignal) {
	return {
		async resolveOccurrence(input: { requestBytes: string; authorityBytes: string; authority: { capabilityId: string } }) {
			const response = await client.request({ method: "POST", path: "/trellis-v1/review-classifications/visits",
				body: JSON.stringify({ requestBytes: input.requestBytes, authorityBytes: input.authorityBytes }),
				capabilityId: input.authority.capabilityId, signal });
			if (response.state === "unknown") throw new Error("review_gate_lookup_unknown");
			if (response.status !== 200) throw new Error("review_gate_lookup_refused");
			return ReviewVisitProofSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)));
		},
		async accept(input: { engineWaitId: string; resultBytes: string; deliveryBytes: string; authorityBytes: string; capabilityId: string }) {
			return client.request({ method: "POST", path: "/trellis-v1/review-classifications/accept",
				body: JSON.stringify({ engineWaitId: input.engineWaitId, resultBytes: input.resultBytes,
					deliveryBytes: input.deliveryBytes, authorityBytes: input.authorityBytes }),
				capabilityId: input.capabilityId, signal });
		},
	};
}
