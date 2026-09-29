import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { NativeHandleV1Schema, NativeRequestV1Schema, readProtocolBytes } from "../../../langflowContracts";
import type { createEngineClient } from "../../../langflowHost/engineClient";
import { NativeVisitSchema } from "../nativeVisit";

const waitSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("native_reservation"), waitId: z.uuid(), request: NativeRequestV1Schema }),
	z.strictObject({ kind: z.literal("native"), waitId: z.uuid(), request: NativeRequestV1Schema, handle: NativeHandleV1Schema }),
]);

export async function readNativeVisit(
	client: ReturnType<typeof createEngineClient>,
	input: { requestBytes: string; authorityBytes: string; capabilityId: string; signal: AbortSignal },
) {
	const response = await client.request({
		method: "POST",
		path: "/trellis-v1/native/visit",
		body: JSON.stringify({ requestBytes: input.requestBytes, authorityBytes: input.authorityBytes }),
		capabilityId: input.capabilityId,
		signal: input.signal,
	});
	if (response.state === "unknown") throw new Error("native_visit_read_unknown");
	if (response.status !== 200) throw new Error(`native_visit_read_refused:${response.status}`);
	if (response.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
		throw new Error("native_visit_content_type");
	const visit = NativeVisitSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes)));
	if (visit.requestBytes !== input.requestBytes) throw new Error("native_visit_request_conflict");
	const wait = readProtocolBytes(waitSchema, visit.waitBytes);
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	if (wait.waitId !== visit.engineWaitId || !isDeepStrictEqual(wait.request, request))
		throw new Error("native_visit_wait_conflict");
	return visit;
}
