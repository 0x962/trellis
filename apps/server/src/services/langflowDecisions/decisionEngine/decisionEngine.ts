import { isDeepStrictEqual } from "node:util";
import { DeliveryAuthorityV1Schema } from "../../../langflowContracts";
import type { createEngineClient, DispatchReceiptArchive } from "../../../langflowHost";
import type { DecisionEngine } from "../deliver";

export function decisionEngine(
	client: Pick<ReturnType<typeof createEngineClient>, "request">,
	input: {
		signal: AbortSignal;
		archive: Pick<DispatchReceiptArchive, "readAuthorityBytes">;
		beforeAccept: (input: Parameters<DecisionEngine["accept"]>[0]) => Promise<void>;
	},
): DecisionEngine {
	async function post(
		path: "/trellis-v1/decisions/lookup" | "/trellis-v1/decisions/accept",
		body: unknown,
		capabilityId?: string,
	) {
		const response = await client.request({
			method: "POST",
			path,
			body: JSON.stringify(body),
			capabilityId,
			signal: input.signal,
		});
		if (response.state === "unknown") throw new Error("decision_acknowledgement_unknown");
		if (response.status !== 200) throw new Error("decision_engine_response_refused");
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes));
	}
	return {
		lookup: (request) => post("/trellis-v1/decisions/lookup", request),
		async accept(request) {
			const authorityBytes = input.archive.readAuthorityBytes(request.authority);
			if (!isDeepStrictEqual(DeliveryAuthorityV1Schema.parse(JSON.parse(authorityBytes)), request.authority))
				throw new Error("decision_authority_bytes_conflict");
			await input.beforeAccept(request);
			return post(
				"/trellis-v1/decisions/accept",
				{
					decisionBytes: request.decisionBytes,
					payloadDigest: request.payloadDigest,
					authorityBytes,
				},
				request.authority.capabilityId,
			);
		},
	};
}
