import { afterEach, expect, test } from "bun:test";
import { authorityControl, readDecision } from "../../../db/queries/langflowExecution";
import type { DecisionAcceptanceV1, DecisionLookupRequestV1 } from "../../../langflowContracts";
import type { DispatchPermit, DispatchState, TerminalReceipt } from "../../../langflowHost";
import { cancelExecution } from "../../langflowStops/cancelExecution";
import { type DecisionStateInput, decisionState } from "../decisionState";
import { record } from "../record";
import { transactionFixture } from "../record/components/transactionFixture";
import { accepted } from "../testFixture";
import { type DecisionConnectionDependencies, decisionConnection } from "./decisionConnection";

const databases: Awaited<ReturnType<typeof transactionFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});

async function fixture() {
	const f = await transactionFixture();
	databases.push(f.db);
	const view = await f.db.transaction((tx) =>
		record(f.ctx, tx, { ...f.input, output: "Full NO feedback\n雪".repeat(10001) }),
	);
	const input = { executionId: f.input.id, decisionId: view.decisionDeliveries[0]!.decisionId };
	const stored = (await f.db.transaction((tx) => readDecision(tx, input)))!;
	const identity = {
		hostId: f.authority.hostId,
		ownerId: f.authority.ownerId,
		dataHomeId: "data-home",
		instanceId: "instance",
		manifestDigest: "a".repeat(64),
	};
	const state: DispatchState = {
		version: 1,
		dataHomeId: identity.dataHomeId,
		generation: 1,
		block: null,
		permits: [],
		reconciliations: [],
		captureGrants: [],
	};
	let receipt: DecisionAcceptanceV1 | null = null;
	let acceptCalls = 0;
	let now = f.system.now;
	let beforeLookup: (() => Promise<void>) | undefined;
	const sent: { decisionBytes: string; authorityBytes: string; payloadDigest: string }[] = [];
	const authorityBytes = `${JSON.stringify(f.authority, null, 2)}\n`;

	const deps: DecisionConnectionDependencies = {
		log: () => {},
		transport: {
			call: async (name, requestContext, input) => {
				expect(name).toBe("langflowDecisions.state");
				return f.db.transaction((tx) =>
					decisionState({ ...f.system, ...requestContext, now }, tx, input as DecisionStateInput),
				);
			},
		},
		signal: new AbortController().signal,
		supervisor: {
			async withHealthyEngine(operation) {
				return operation({
					id: "observation",
					identity,
					endpoint: "http://127.0.0.1:9000",
					observedAt: now.toISOString(),
				});
			},
		},
		engineTransport: {
			authenticationFile: "/fixture/private-token",
			dependencies: {
				readAuthenticationFile: async () => "private-token",
				fetch: async (url, init) => {
					expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-token");
					const body = JSON.parse(String(init?.body));
					if (String(url).endsWith("/lookup")) {
						await beforeLookup?.();
						return Response.json(
							receipt ? { state: "accepted", receipt } : { state: "absent", lookup: body, authoritative: true },
						);
					}
					expect(String(url)).toBe("http://127.0.0.1:9000/trellis-v1/decisions/accept");
					sent.push(body);
					acceptCalls++;
					const decision = JSON.parse(body.decisionBytes);
					const lookup: DecisionLookupRequestV1 = {
						version: 1,
						...input,
						engineJobId: stored.engineJobId,
						engineRequestId: decision.wait.engineRequestId,
						payloadDigest: body.payloadDigest,
					};
					receipt = accepted(lookup);
					throw new TypeError("lost response after durable engine acceptance");
				},
			},
		},
		gate: {
			read: () => state,
			recoverPermit: (binding) => state.permits.find((row) => row.permit.binding.effectId === binding.effectId) ?? null,
			acquire: (binding) => {
				const permit: DispatchPermit = { id: "permit", dataHomeId: identity.dataHomeId, generation: 1, binding };
				state.permits.push({ permit, terminal: null });
				return permit;
			},
			settle: async (permit, id) => {
				state.permits[0]!.terminal = { id, permit, outcome: "completed" };
			},
		},
		archive: {
			readAuthorityBytes: () => authorityBytes,
			writeTerminal: ({ permit }): TerminalReceipt => ({ id: "terminal", permit, outcome: "completed" }),
		},
	};
	return {
		f,
		connection: decisionConnection(deps),
		deps,
		input,
		stored,
		sent,
		authorityBytes,
		state,
		identity,
		calls: () => acceptCalls,
		expire: () => {
			now = new Date("2030-01-01T00:00:00Z");
		},
		beforeLookup: (callback: () => Promise<void>) => {
			beforeLookup = callback;
		},
	};
}

test("lost HTTP acknowledgement recovers exact acceptance after expiry without another accept", async () => {
	const h = await fixture();
	await h.connection.committed(h.input);
	expect((await h.f.db.transaction((tx) => readDecision(tx, h.input)))!.delivery.state).toBe("unknown");
	expect(h.state.permits[0]!.terminal).toBeNull();
	expect(h.sent[0]!.decisionBytes).toBe(h.stored.payloadBytes);
	expect(h.sent[0]!.authorityBytes).toBe(h.authorityBytes);
	h.expire();
	await decisionConnection(h.deps).recover();
	const recovered = (await h.f.db.transaction((tx) => readDecision(tx, h.input)))!.delivery;
	expect(recovered.state).toBe("confirmed");
	expect(h.calls()).toBe(1);
	expect(recovered.decision.output).toBe(h.stored.delivery.decision.output);
	expect(h.state.permits[0]!.terminal?.outcome).toBe("completed");
});

test("cancellation after recording prevents acceptance but preserves the decision", async () => {
	const h = await fixture();
	await h.f.db.transaction((tx) =>
		cancelExecution(h.f.ctx, tx, { id: h.input.executionId, expectedRevision: h.f.input.expectedRevision + 1 }),
	);
	await h.connection.committed(h.input);
	expect(h.calls()).toBe(0);
	expect((await h.f.db.transaction((tx) => readDecision(tx, h.input)))!.payloadBytes).toBe(h.stored.payloadBytes);
});

test("revocation after lookup prevents a new engine acceptance", async () => {
	const h = await fixture();
	h.beforeLookup(async () => {
		await h.f.db.transaction((tx) =>
			authorityControl.revokeOwner(tx, { identity: h.identity, observationId: "revoked" }),
		);
	});
	await h.connection.committed(h.input);
	expect(h.calls()).toBe(0);
	expect(h.state.permits).toHaveLength(0);
});

test("the state service rejects a human caller", async () => {
	const h = await fixture();
	await expect(
		h.f.db.transaction((tx) => decisionState(h.f.ctx, tx, { operation: "page", input: { after: null } })),
	).rejects.toThrow("authority_conflict");
});

test("a confirmed decision settles an interrupted permit without engine access", async () => {
	const h = await fixture();
	await h.connection.committed(h.input);
	const originalSettle = h.deps.gate.settle;
	h.deps.gate.settle = async () => {
		throw new Error("crash before permit settlement");
	};
	await h.connection.recover();
	expect((await h.f.db.transaction((tx) => readDecision(tx, h.input)))!.delivery.state).toBe("confirmed");
	h.deps.gate.settle = originalSettle;
	h.deps.supervisor.withHealthyEngine = async () => {
		throw new Error("engine unavailable");
	};
	await decisionConnection(h.deps).recover();
	expect(h.state.permits[0]!.terminal?.outcome).toBe("completed");
	expect(h.calls()).toBe(1);
});
