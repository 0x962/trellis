import { expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { createEngineClient } from "../../engineClient";
import { deliverInitialAuthority } from "./deliverInitialAuthority";

const originalAuthorityBytes = '{"capabilityId":"original"}\n';
const authorityBytes = '{"capabilityId":"successor"}\n';
const successorCommitBytes = JSON.stringify({ authorityBytes });
const requestBytes = JSON.stringify({
	version: 1,
	requestId: crypto.randomUUID(),
	originalAuthorityBytes,
	initialRecordBytes: JSON.stringify({ authorityBytes: originalAuthorityBytes }),
	successorCommitBytes,
});
const request = JSON.parse(requestBytes);
const receipt = {
	version: 1,
	requestId: request.requestId,
	requestDigest: protocolDigest(requestBytes),
	originalAuthorityDigest: protocolDigest(originalAuthorityBytes),
	successorAuthorityDigest: protocolDigest(authorityBytes),
	successorCommitDigest: protocolDigest(successorCommitBytes),
	state: "committed",
};

test("unknown recovery keeps the original request bytes for exact replay", async () => {
	const bodies: unknown[] = [];
	const sourceBytes = JSON.stringify(receipt);
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:7860",
		authenticationFile: "fixture",
		dependencies: {
			readAuthenticationFile: async () => "fixture-token",
			fetch: async (url, init) => {
				expect(new URL(String(url)).pathname).toBe("/trellis-v1/authority/recover-initial");
				bodies.push(init?.body);
				if (bodies.length === 1) throw new Error("lost_response");
				return new Response(sourceBytes);
			},
		},
	});
	const input = { client, requestBytes, signal: new AbortController().signal };
	expect(await deliverInitialAuthority(input)).toEqual({ state: "unknown" });
	expect(await deliverInitialAuthority(input)).toEqual({ state: "confirmed", sourceBytes });
	expect(bodies).toEqual([requestBytes, requestBytes]);
});

test("a receipt for different successor bytes cannot settle recovery", async () => {
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:7860",
		authenticationFile: "fixture",
		dependencies: {
			readAuthenticationFile: async () => "fixture-token",
			fetch: async () => Response.json({ ...receipt, successorCommitDigest: "a".repeat(64) }),
		},
	});
	await expect(deliverInitialAuthority({
		client,
		requestBytes,
		signal: new AbortController().signal,
	})).rejects.toThrow("initial_recovery_engine_receipt_conflict");
});
