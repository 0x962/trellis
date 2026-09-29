import { expect, test } from "bun:test";
import { createEngineClient } from "../../../langflowHost/engineClient";
import { promptFixture } from "../assembleNativePrompt/fixture";
import { readNativeVisit } from "./readNativeVisit";

function fixture() {
	const { request, approved } = promptFixture();
	request.admissionReceipt = { ...request.admissionReceipt, executionId: request.executionId, publicationId: request.publicationId };
	const requestBytes = JSON.stringify(request, null, 2);
	return { requestBytes, visit: {
		engineNodeId: "vertex", requestBytes,
		occurrence: { nodeId: request.nodeId, occurrenceKey: request.occurrenceKey, parentOccurrenceKey: request.parentOccurrenceKey,
			phase: request.phase, iterationPath: request.iterationPath },
		scope: { inputReceiptIds: request.inputReceiptIds, groupDeadlineRefs: request.groupDeadlineRefs, deadlineAt: request.deadlineAt },
		admissionReceipt: request.admissionReceipt, inputReceipts: approved.inputReceipts,
	} };
}

test("uses the actual private client and preserves the original request string", async () => {
	const { requestBytes, visit } = fixture();
	let calls = 0;
	const signal = new AbortController().signal;
	const client = createEngineClient({ endpoint: "http://127.0.0.1:49000", authenticationFile: "/fixture/token", dependencies: {
		readAuthenticationFile: async (path) => { expect(path).toBe("/fixture/token"); return "private-token"; },
		fetch: async (url, init) => {
			calls++;
			expect(String(url)).toBe("http://127.0.0.1:49000/trellis-v1/native/visit");
			expect(init?.signal).toBe(signal);
			expect(init?.redirect).toBe("error");
			expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-token");
			expect(new Headers(init?.headers).get("X-Trellis-Capability-Id")).toBe("capability");
			expect(JSON.parse(String(init?.body))).toEqual({ requestBytes, authorityBytes: "original grant bytes" });
			return Response.json(visit);
		},
	} });
	expect(await readNativeVisit(client, { requestBytes, authorityBytes: "original grant bytes", capabilityId: "capability", signal })).toEqual(visit);
	expect(calls).toBe(1);
});

test("rejects uncertain transport, refusal, and changed response bytes without retries", async () => {
	const { requestBytes, visit } = fixture();
	for (const result of [null, new Response("refused", { status: 409 }), Response.json({ ...visit, requestBytes: requestBytes + " " }), new Response("not json")]) {
		let calls = 0;
		const client = createEngineClient({ endpoint: "http://127.0.0.1:49000", authenticationFile: "/fixture/token", dependencies: {
			readAuthenticationFile: async () => "private-token",
			fetch: async () => { calls++; if (result === null) throw new Error("disconnected"); return result; },
		} });
		await expect(readNativeVisit(client, { requestBytes, authorityBytes: "grant", capabilityId: "capability", signal: new AbortController().signal })).rejects.toThrow();
		expect(calls).toBe(1);
	}
});
