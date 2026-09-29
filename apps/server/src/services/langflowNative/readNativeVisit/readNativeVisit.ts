import type { createEngineClient } from "../../../langflowHost/engineClient";
import { NativeVisitSchema } from "../nativeVisit";

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
	return visit;
}
