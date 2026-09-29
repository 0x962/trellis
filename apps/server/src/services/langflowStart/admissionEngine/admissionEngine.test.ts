import { expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { createEngineClient, type EngineRequest, type EngineResponse } from "../../../langflowHost";
import { fixture } from "../components/fixture/fixture";
import { reconcile } from "../reconcile/reconcile";
import { createAdmissionEngine } from "./admissionEngine";

const received = (body: unknown): EngineResponse => ({
	state: "received",
	status: 200,
	contentType: "application/json",
	bytes: new TextEncoder().encode(JSON.stringify(body)),
});

async function admission() {
	const f = fixture();
	await reconcile(f.context, { executionId: f.initial.executionId }, f);
	const execution = f.current();
	if (execution.admission.state !== "open" || !execution.authority) throw new Error("fixture_admission_missing");
	const receipt = execution.admission.receipt;
	const payloadBytes = `${JSON.stringify(receipt, null, 2)}\n`;
	const authority = execution.authority;
	const authorityBytes = await f.readAuthorityBytes(authority);
	const requests: EngineRequest[] = [];
	const replies: EngineResponse[] = [];
	const engine = createAdmissionEngine({
		signal: new AbortController().signal,
		admissionBytes: async () => ({ payloadBytes, confirmed: false }),
		request: async (request) => {
			requests.push(request);
			return replies.shift()!;
		},
	});
	return {
		engine,
		replies,
		requests,
		payloadBytes,
		receipt,
		authority,
		authorityBytes,
		current: received({ authority, authorityBytes, authorityDigest: protocolDigest(authorityBytes), revokedAt: null }),
	};
}

test("admission preserves the stored receipt and original authority text", async () => {
	const f = await admission();
	f.replies.push(f.current, received({ state: "admitted", receiptBytes: f.payloadBytes }));
	expect((await f.engine.admit(f)).state).toBe("admitted");
	expect(JSON.parse(f.requests[1]!.body!)).toEqual({ receiptBytes: f.payloadBytes, authorityBytes: f.authorityBytes });
});

test("an equivalent but reserialized receipt does not confirm admission", async () => {
	const f = await admission();
	f.replies.push(f.current, received({ state: "admitted", receiptBytes: JSON.stringify(f.receipt) }));
	await expect(f.engine.admit(f)).rejects.toThrow("admission_receipt_bytes_conflict");
});

test("a lost authority acknowledgement prevents admission", async () => {
	const f = await admission();
	f.replies.push(
		{
			state: "received",
			status: 404,
			contentType: "application/json",
			bytes: new TextEncoder().encode('{"detail":"engine_authority_not_found"}'),
		},
		{ state: "unknown" },
	);
	expect((await f.engine.admit(f)).state).toBe("unknown");
	expect(f.requests.map((request) => request.path)).toEqual([
		`/trellis-v1/authority/${f.receipt.executionId}`,
		"/trellis-v1/authority/commit",
	]);
});

for (const response of [
	{ state: "unknown" },
	{ state: "received", status: 503, contentType: "application/json", bytes: new Uint8Array() },
	{ state: "received", status: 200, contentType: "text/html", bytes: new TextEncoder().encode("<html>") },
	{ state: "received", status: 200, contentType: "application/json", bytes: new Uint8Array([0xff]) },
] satisfies EngineResponse[]) {
	test(`unusable lookup response stays unknown: ${JSON.stringify(response)}`, async () => {
		const key = { version: 1 as const, hostId: "h", executionId: "e" };
		const engine = createAdmissionEngine({
			signal: new AbortController().signal,
			admissionBytes: async () => null,
			request: async () => response,
		});
		expect(await engine.lookup(key)).toEqual({ state: "unknown", key });
	});
}

test("a body stream failure from EngineClient remains unknown", async () => {
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:7860",
		authenticationFile: "/private/fixture",
		dependencies: {
			readAuthenticationFile: async () => "fixture",
			fetch: async () =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error("lost_body"));
						},
					}),
					{ headers: { "Content-Type": "application/json" } },
				),
		},
	});
	const engine = createAdmissionEngine({
		request: client.request,
		signal: new AbortController().signal,
		admissionBytes: async () => null,
	});
	const key = { version: 1 as const, hostId: "h", executionId: "e" };
	expect(await engine.lookup(key)).toEqual({ state: "unknown", key });
});
