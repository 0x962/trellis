import { expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { cancellationEngine } from "./cancellationEngine";

const input = {
	executionId: "execution",
	publicationId: "publication",
	engineJobId: "00000000-0000-4000-8000-000000000001",
	requestId: "00000000-0000-4000-8000-000000000002",
	cancelIntentBytes: '{ "exact": "intent" }\n',
	authorityBytes: '{ "exact": "authority" }\n',
};
const signal = new AbortController().signal;
const receipt = {
	version: 1 as const,
	receiptId: "00000000-0000-4000-8000-000000000003",
	requestId: input.requestId,
	executionId: input.executionId,
	engineJobId: input.engineJobId,
	cancelIntentDigest: protocolDigest(input.cancelIntentBytes),
	acceptedAt: "2026-09-29T06:05:00.000Z",
};

test("private cancellation sends exact bytes and retains actual failure status", async () => {
	const engine = cancellationEngine({
		endpoint: "http://127.0.0.1:1234",
		authenticationFile: "auth",
		dependencies: {
			readAuthenticationFile: async () => "token",
			fetch: async (url, init) => {
				expect(String(url)).toBe("http://127.0.0.1:1234/trellis-v1/cancellation");
				expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token");
				expect(JSON.parse(String(init?.body))).toEqual(input);
				expect(init?.signal).toBe(signal);
				return Response.json({ receipt, engineStatus: "failed" });
			},
		},
	});
	expect(await engine.cancel(input, signal)).toEqual({ state: "confirmed", receipt, engineStatus: "failed" });
});

test("an unknown response, conflict, or empty response cannot acknowledge cancellation", async () => {
	for (const status of [null, 409, 204]) {
		const engine = cancellationEngine({
			endpoint: "http://127.0.0.1:1234",
			authenticationFile: "auth",
			dependencies: {
				readAuthenticationFile: async () => "token",
				fetch: async () => {
					if (status === null) throw new Error("lost response");
					return new Response(null, { status });
				},
			},
		});
		expect(await engine.cancel(input, signal)).toEqual(
			status === null ? { state: "unknown" } : { state: "failed", status },
		);
	}
});

test("changed request identity or an invented status fails receipt validation", async () => {
	for (const response of [
		{ receipt: { ...receipt, requestId: crypto.randomUUID() }, engineStatus: "cancelled" },
		{ receipt: { ...receipt, cancelIntentDigest: "f".repeat(64) }, engineStatus: "cancelled" },
		{ receipt, engineStatus: "success" },
	]) {
		const engine = cancellationEngine({
			endpoint: "http://127.0.0.1:1234",
			authenticationFile: "auth",
			dependencies: { readAuthenticationFile: async () => "token", fetch: async () => Response.json(response) },
		});
		await expect(engine.cancel(input, signal)).rejects.toThrow();
	}
});
