import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
	CompletionReceiptV1Schema, DeliveryAuthorityV1Schema, NativeResultV1Schema,
	protocolDigest, readProtocolBytes,
} from "../../../../langflowContracts";
import type { EngineRequest, EngineResponse } from "../../../../langflowHost/engineClient";
import type { NativeDelivery, NativeEngineClient } from "../contracts";
import { readNativeWait } from "../waitBinding";

const visitSchema = z.object({ requestBytes: z.string(), engineWaitId: z.string().min(1), waitBytes: z.string() });
const lookupSchema = z.strictObject({
	version: z.literal(1), engineJobId: z.uuid(), engineWaitId: z.string().min(1),
	state: z.enum(["waiting", "completed"]), waitBytes: z.string(),
	resultBytes: z.string().nullable(), receiptBytes: z.string().nullable(),
});

function json(response: Extract<EngineResponse, { state: "received" }>) {
	if (response.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
		throw new Error("native_completion_content_type");
	return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes));
}

export async function deliverNativeCompletion(input: {
	client: NativeEngineClient;
	delivery: NativeDelivery;
	authorityBytes: string;
	signal: AbortSignal;
	current(): Promise<NativeDelivery | null>;
}) {
	const { delivery, signal } = input;
	const issued = readProtocolBytes(DeliveryAuthorityV1Schema, input.authorityBytes);
	if (!isDeepStrictEqual(issued, delivery.authority)) throw new Error("native_authority_bytes_conflict");
	const result = readProtocolBytes(NativeResultV1Schema, delivery.resultBytes);
	const pending = (reason: string) => ({ state: "pending" as const, reason });
	const request = async (path: EngineRequest["path"], body: unknown) => {
		signal.throwIfAborted();
		try {
			return await input.client.request({ method: "POST", path, body: JSON.stringify(body),
				capabilityId: issued.capabilityId, signal });
		} catch (error) {
			if (signal.aborted) throw error;
			return { state: "unknown" as const };
		}
	};
	const visited = await request("/trellis-v1/native/visit", {
		requestBytes: delivery.requestBytes, authorityBytes: input.authorityBytes,
	});
	if (visited.state === "unknown") return pending("visit_unknown");
	if (visited.status !== 200) return pending(`visit_refused:${visited.status}`);
	const visit = visitSchema.parse(json(visited));
	if (visit.requestBytes !== delivery.requestBytes) throw new Error("native_visit_request_conflict");
	const rawWait = JSON.parse(visit.waitBytes) as { kind?: string; waitId?: string };
	if (rawWait.kind === "native_reservation" && rawWait.waitId === visit.engineWaitId)
		return pending("reservation_wait");
	const wait = readNativeWait({ ...delivery, waitBytes: visit.waitBytes });
	if (wait.waitId !== visit.engineWaitId) throw new Error("native_visit_wait_conflict");
	function accepted(bytes: string) {
		const receipt = readProtocolBytes(CompletionReceiptV1Schema, bytes);
		if (receipt.executionId !== result.launchBinding.executionId || receipt.engineJobId !== issued.engineJobId ||
			receipt.engineWaitId !== wait.waitId || receipt.completionId !== result.completionId ||
			receipt.resultDigest !== protocolDigest(delivery.resultBytes)) throw new Error("native_completion_receipt_conflict");
		return { state: "accepted" as const, receipt, waitBytes: visit.waitBytes };
	}
	let reason = "completion_unknown";
	async function lookup() {
		const looked = await request("/trellis-v1/native/lookup", {
		jobId: issued.engineJobId, waitId: wait.waitId, authorityBytes: input.authorityBytes,
		});
		if (looked.state === "unknown" || looked.status !== 200) {
			reason = looked.state === "unknown" ? "lookup_unknown" : `lookup_refused:${looked.status}`;
			return { state: "unknown" as const };
		}
		const found = lookupSchema.parse(json(looked));
		if (found.engineJobId !== issued.engineJobId || found.engineWaitId !== wait.waitId || found.waitBytes !== visit.waitBytes)
			throw new Error("native_completion_lookup_conflict");
		if (found.state === "completed") {
			if (found.resultBytes !== delivery.resultBytes || found.receiptBytes === null)
				throw new Error("native_completion_lookup_conflict");
			return { state: "resolved" as const, value: accepted(found.receiptBytes) };
		}
		if (found.resultBytes !== null || found.receiptBytes !== null) throw new Error("native_completion_lookup_conflict");
		return { state: "absent" as const };
	}
	const recovered = await input.client.recoverMutation({ lookup, mutate: async () => {
		const current = await input.current();
		if (current === null || !isDeepStrictEqual(current.authority, issued)) {
			reason = current === null ? "delivery_withdrawn" : "authority_changed";
			return { state: "unknown" as const };
		}
		if (current.requestBytes !== delivery.requestBytes || current.resultBytes !== delivery.resultBytes)
			throw new Error("native_completion_bytes_conflict");
		const sent = await request("/trellis-v1/native/completions", {
			engineWaitId: wait.waitId, resultBytes: delivery.resultBytes,
			deliveryBytes: current.deliveryBytes, authorityBytes: input.authorityBytes,
		});
		if (sent.state === "unknown" || sent.status !== 200) {
			reason = sent.state === "unknown" ? "completion_unknown" : `completion_refused:${sent.status}`;
			return { state: "unknown" as const };
		}
		CompletionReceiptV1Schema.parse(json(sent));
		return { state: "resolved" as const, value: accepted(new TextDecoder("utf-8", { fatal: true }).decode(sent.bytes)) };
	},
	});
	return recovered.state === "resolved" ? recovered.value : pending(reason);
}
