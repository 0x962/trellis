import { describe, expect, test } from "bun:test";
import type { DecisionLookupRequestV1 } from "../../../langflowContracts";
import { createReceipt } from "../createReceipt";
import { accepted, testFixture } from "../testFixture";
import { type DecisionEngine, deliver as deliverWithLog, type PreparedDecision } from "./deliver.ts";

const deliver = (prepared: PreparedDecision, engine: DecisionEngine) => deliverWithLog(prepared, engine, () => {});

const prepared = () => {
	const f = testFixture();
	return { ...createReceipt(f.ctx, f.view, f.checkpoint, f.input), authority: f.authority };
};

describe("decision acknowledgement", () => {
	test("recovers lost acknowledgement by exact lookup without a second accept", async () => {
		const saved = prepared();
		let receipt: ReturnType<typeof accepted> | undefined;
		let lookup: DecisionLookupRequestV1;
		let calls = 0;
		const engine = {
			lookup: async (input: DecisionLookupRequestV1) => {
				lookup = input;
				return receipt ? { state: "accepted", receipt } : { state: "absent", lookup: input, authoritative: true };
			},
			accept: async (input: { decisionBytes: string }) => {
				calls++;
				expect(input.decisionBytes).toBe(saved.payloadBytes);
				receipt = accepted(lookup);
				throw new Error("Connection closed after commit");
			},
		};
		const unknown = await deliver(saved, engine);
		expect(unknown.state).toBe("unknown");
		const confirmed = await deliver({ ...saved, delivery: unknown }, engine);
		expect(confirmed.state).toBe("confirmed");
		expect(confirmed.decision).toEqual(saved.delivery.decision);
		expect(calls).toBe(1);
	});
	test("unknown lookup never authorizes delivery or confirmation", async () => {
		let calls = 0;
		const result = await deliver(prepared(), {
			lookup: async (lookup) => ({ state: "unknown", lookup }),
			accept: async () => {
				calls++;
				return {};
			},
		});
		expect(result.state).toBe("unknown");
		expect(calls).toBe(0);
	});
	test("an explicit receipt conflict stops recovery", async () => {
		let calls = 0;
		await expect(
			deliver(prepared(), {
				lookup: async (lookup) => ({ state: "conflict", lookup, acceptedDigest: "a".repeat(64) }),
				accept: async () => {
					calls++;
					return {};
				},
			}),
		).rejects.toThrow("decision_acceptance_conflict");
		expect(calls).toBe(0);
	});
	test("network diagnostics retain identity and exclude private payloads", async () => {
		for (const operation of ["lookup", "accept"] as const) {
			const saved = prepared();
			const logs: { message: string; fields?: Record<string, unknown> }[] = [];
			const failure = new TypeError("private notes and credentials");
			const result = await deliverWithLog(
				saved,
				{
					lookup: async (lookup) => {
						if (operation === "lookup") throw failure;
						return { state: "absent", lookup, authoritative: true };
					},
					accept: async () => {
						throw failure;
					},
				},
				(message, fields) => logs.push({ message, fields }),
			);
			expect(result.state).toBe("unknown");
			expect(logs).toEqual([
				{
					message: "Human decision delivery failed",
					fields: {
						operation,
						executionId: saved.delivery.decision.wait.executionId,
						decisionId: saved.delivery.decision.decisionId,
						engineRequestId: saved.delivery.decision.wait.engineRequestId,
						category: "TypeError",
					},
				},
			]);
		}
	});
	test("generic HTTP conflict retains an unknown receipt", async () => {
		const result = await deliver(prepared(), {
			lookup: async (lookup) => ({ state: "absent", lookup, authoritative: true }),
			accept: async () => {
				throw new Error("HTTP 409");
			},
		});
		expect(result.state).toBe("unknown");
	});
	test("rejects a changed digest and a mismatched acceptance", async () => {
		const saved = prepared();
		await expect(
			deliver(
				{ ...saved, payloadBytes: `${saved.payloadBytes} ` },
				{
					lookup: async () => {
						throw new Error("must not call");
					},
					accept: async () => ({}),
				},
			),
		).rejects.toThrow("identity_conflict");
		await expect(
			deliver(saved, {
				lookup: async (lookup) => ({
					state: "accepted",
					receipt: { ...accepted(lookup), payloadDigest: "f".repeat(64) },
				}),
				accept: async () => ({}),
			}),
		).rejects.toThrow();
	});
	test("refuses an absent response for another request", async () => {
		await expect(
			deliver(prepared(), {
				lookup: async (lookup) => ({
					state: "absent",
					authoritative: true,
					lookup: { ...lookup, engineRequestId: "later-request" },
				}),
				accept: async () => ({}),
			}),
		).rejects.toThrow("decision_lookup_conflict");
	});
});
