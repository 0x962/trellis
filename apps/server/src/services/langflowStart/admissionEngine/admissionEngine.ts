import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
	AdmissionReceiptV1Schema,
	CorrelationKeyV1Schema,
	CorrelationReceiptV1Schema,
	type DeliveryAuthorityV1,
	DeliveryAuthorityV1Schema,
	protocolDigest,
} from "../../../langflowContracts";
import type { EngineRequest, EngineResponse } from "../../../langflowHost";
import type { LangflowStartEngine } from "../engine";
import { responseValue } from "./components/response/response";

const found = z.strictObject({ state: z.literal("found"), receiptBytes: z.string() });
const lookupResult = z.discriminatedUnion("state", [
	found,
	z.strictObject({ state: z.literal("absent"), key: CorrelationKeyV1Schema, authoritative: z.literal(true) }),
	z.strictObject({ state: z.literal("unknown"), key: CorrelationKeyV1Schema }),
]);
const admissionResult = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("admitted"), receiptBytes: z.string() }),
	z.strictObject({ state: z.literal("pending") }),
	z.strictObject({ state: z.literal("unknown") }),
]);
const authorityResult = z.object({
	authorityBytes: z.string(),
	authorityDigest: z.string(),
	authority: DeliveryAuthorityV1Schema,
	revokedAt: z.string().nullable().optional(),
});
export type AdmissionEngineOptions = {
	request(input: EngineRequest, authority?: DeliveryAuthorityV1): Promise<EngineResponse>;
	admissionBytes(executionId: string): Promise<{ payloadBytes: string; confirmed: boolean } | null>;
	signal: AbortSignal;
};

export function createAdmissionEngine(options: AdmissionEngineOptions): LangflowStartEngine {
	const request = async (input: Omit<EngineRequest, "signal">, authority?: DeliveryAuthorityV1) => {
		try {
			return await options.request({ ...input, signal: options.signal }, authority);
		} catch {
			return { state: "unknown" as const };
		}
	};
	async function installAuthority(authority: DeliveryAuthorityV1, authorityBytes: string) {
		const currentResponse = await request(
			{ method: "GET", path: `/trellis-v1/authority/${encodeURIComponent(authority.executionId)}` },
			authority,
		);
		if (currentResponse.state === "unknown") return false;
		const current = responseValue(currentResponse, authorityResult);
		if (
			current?.authorityBytes === authorityBytes &&
			current.revokedAt === null &&
			current.authorityDigest === protocolDigest(authorityBytes) &&
			isDeepStrictEqual(current.authority, authority)
		)
			return true;
		if (!current && currentResponse.status !== 404) return false;
		if (
			current &&
			(current.authority.executionId !== authority.executionId ||
				current.authority.engineJobId !== authority.engineJobId ||
				current.authority.publicationId !== authority.publicationId ||
				current.authority.hostId !== authority.hostId)
		)
			throw new Error("engine_authority_scope_conflict");
		const saved = responseValue(
			await request(
				{
					method: "POST",
					path: "/trellis-v1/authority/commit",
					body: JSON.stringify({ authorityBytes, expectedCapabilityId: current?.authority.capabilityId ?? null }),
					capabilityId: authority.capabilityId,
				},
				authority,
			),
			authorityResult,
		);
		return (
			saved !== null &&
			saved.authorityBytes === authorityBytes &&
			saved.authorityDigest === protocolDigest(authorityBytes) &&
			isDeepStrictEqual(saved.authority, authority)
		);
	}
	return {
		async lookup(key) {
			const result = responseValue(
				await request({ method: "POST", path: "/trellis-v1/admission/lookup", body: JSON.stringify(key) }),
				lookupResult,
			);
			if (!result) return { state: "unknown", key };
			if (result.state !== "found") return result;
			return { state: "found", receipt: CorrelationReceiptV1Schema.parse(JSON.parse(result.receiptBytes)) };
		},
		async submit(input) {
			const envelope = JSON.parse(input.envelopeBytes);
			const key = CorrelationKeyV1Schema.parse({
				version: 1,
				hostId: envelope.hostId,
				executionId: envelope.executionId,
			});
			const result = responseValue(
				await request({
					method: "POST",
					path: "/trellis-v1/admission/submit",
					body: JSON.stringify({ envelopeBytes: input.envelopeBytes, payloadBytes: input.payloadBytes }),
				}),
				lookupResult,
			);
			if (result?.state !== "found") return { state: "unknown", key };
			return { state: "found", receipt: CorrelationReceiptV1Schema.parse(JSON.parse(result.receiptBytes)) };
		},
		async admit({ receipt, authority, authorityBytes }) {
			const saved = await options.admissionBytes(receipt.executionId);
			if (!saved || !isDeepStrictEqual(JSON.parse(saved.payloadBytes), receipt))
				throw new Error("admission_bytes_conflict");
			if (!(await installAuthority(authority, authorityBytes))) return { state: "unknown" };
			const result = responseValue(
				await request(
					{
						method: "POST",
						path: "/trellis-v1/admission/open",
						body: JSON.stringify({ receiptBytes: saved.payloadBytes, authorityBytes }),
						capabilityId: authority.capabilityId,
					},
					authority,
				),
				admissionResult,
			);
			if (!result) return { state: "unknown" };
			if (result.state !== "admitted") return result;
			if (result.receiptBytes !== saved.payloadBytes) throw new Error("admission_receipt_bytes_conflict");
			return { state: "admitted", receipt: AdmissionReceiptV1Schema.parse(JSON.parse(result.receiptBytes)) };
		},
	};
}
