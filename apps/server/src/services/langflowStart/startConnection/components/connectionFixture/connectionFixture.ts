import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_ACTOR } from "../../../../../context";
import type { CorrelationReceiptV1, DeliveryAuthorityV1 } from "../../../../../langflowContracts";
import { protocolDigest } from "../../../../../langflowContracts";
import {
	DispatchReceiptArchive,
	InitialAuthorityIssuer,
	LangflowHostControl,
	type LiveOwnership,
} from "../../../../../langflowHost";
import { PrivateState } from "../../../../../langflowHost/privateState";
import { databaseFixture } from "../../../databaseStore/components/databaseFixture/databaseFixture";
import { startState, type StartStateCall } from "../../../startState";
import { createStartConnection } from "../../startConnection";

export async function connectionFixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-start-connection-"));
	const home = join(root, "home");
	mkdirSync(home);
	let archive: DispatchReceiptArchive;
	const control = LangflowHostControl.create({
		home,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			async withReconciliation(block, id, commit) {
				commit({ id, block, packageDigest: "a".repeat(64), trellisDatabaseReceiptId: "db",
					engineDatabaseReceiptId: "engine", secretReceiptId: "secret", ownershipReceiptId: "owner",
					nativeAttemptsReceiptId: "native", stopObligationsReceiptId: "stops", snapshotSealReceiptId: null });
			},
		},
	});
	archive = DispatchReceiptArchive.open(control);
	const block = control.gate.read().block!;
	await control.gate.reconcile(block, "fixture");
	const database = await databaseFixture();
	database.deps.hostId = control.identity.hostId;
	const reserved = await database.start();
	const executionId = reserved.execution.executionId;
	const state: StartStateCall = (request) => {
		if (request.operation === "bind" && behavior.failBeforeBind) throw new Error("crash_before_binding");
		return database.run((tx) => startState({ ...database.ctx, actor: SYSTEM_ACTOR }, tx, request));
	};
	const requests: { path: string; body: string }[] = [];
	let correlation: CorrelationReceiptV1 | null = null;
	let grant: { authorityBytes: string; authorityDigest: string; authority: DeliveryAuthorityV1 } | null = null;
	const behavior = { loseSubmission: false, loseAdmission: false, unknownLookup: false, failBeforeBind: false, beforeOpen: async () => {} };
	let authentication = "";
	const server = Bun.serve({
		hostname: "127.0.0.1", port: 0,
		async fetch(request) {
			expect(request.headers.get("authorization")).toBe(`Bearer ${authentication}`);
			const path = new URL(request.url).pathname;
			const body = await request.text();
			requests.push({ path, body });
			if (path === "/trellis-v1/admission/lookup") {
				if (behavior.unknownLookup) return new Response("unavailable", { status: 503 });
				return Response.json(correlation ? { state: "found", receiptBytes: JSON.stringify(correlation) }
					: { state: "absent", key: JSON.parse(body), authoritative: true });
			}
			if (path === "/trellis-v1/admission/submit") {
				const input = JSON.parse(body);
				const envelope = JSON.parse(input.envelopeBytes);
				const stored = await database.run((tx) => database.store.readSubmission(tx, { executionId }));
				expect(input.payloadBytes).toBe(stored.submissionBytes);
				expect(stored.admission.state).toBe("closed");
				correlation = { version: 1, hostId: envelope.hostId, executionId, publicationId: envelope.publicationId,
					submissionDigest: protocolDigest(input.payloadBytes), engineJobId: crypto.randomUUID(),
					engineSessionId: "engine-session", recordedAt: database.ctx.now.toISOString() };
				return behavior.loseSubmission ? new Response("lost", { status: 503 })
					: Response.json({ state: "found", receiptBytes: JSON.stringify(correlation) });
			}
			if (path === `/trellis-v1/authority/${executionId}`)
				return grant ? Response.json({ ...grant, revokedAt: null })
					: Response.json({ detail: "engine_authority_not_found" }, { status: 404 });
			if (path === "/trellis-v1/authority/commit") {
				const input = JSON.parse(body);
				grant = { authorityBytes: input.authorityBytes, authorityDigest: protocolDigest(input.authorityBytes),
					authority: JSON.parse(input.authorityBytes) };
				return Response.json(grant);
			}
			if (path === "/trellis-v1/admission/open") {
				const input = JSON.parse(body);
				const stored = await database.run((tx) => database.store.readSubmission(tx, { executionId }));
				expect(stored.correlation).toEqual(correlation);
				expect(stored.admission.state).toBe("open");
				expect(input.authorityBytes).toBe(archive.readAuthorityBytes(stored.authority!));
				expect(control.gate.read().permits.find((entry) => entry.permit.binding.executionId === executionId)?.terminal).toBeNull();
				await behavior.beforeOpen();
				return behavior.loseAdmission ? new Response("lost", { status: 503 })
					: Response.json({ state: "admitted", receiptBytes: input.receiptBytes });
			}
			return new Response("unexpected", { status: 500 });
		},
	});
	const observation: LiveOwnership = { id: crypto.randomUUID(), observedAt: database.ctx.now.toISOString(),
		endpoint: server.url.origin, identity: { dataHomeId: control.identity.dataHomeId, hostId: control.identity.hostId,
			ownerId: crypto.randomUUID(), instanceId: crypto.randomUUID(), manifestDigest: "c".repeat(64) } };
	const privateState = await PrivateState.open(home);
	await privateState.reserve(observation.identity);
	authentication = await Bun.file(privateState.authenticationFile(observation.identity)).text();
	const supervisor = { async withHealthyEngine<T>(fn: (owner: LiveOwnership) => Promise<T>) { return fn(observation); } };
	const signal = new AbortController();
	const logs: string[] = [];
	const connect = () => createStartConnection({ control, supervisor, archive,
		issuer: new InitialAuthorityIssuer(control, supervisor, archive), database: state,
		authorityLifecycle: {
			async committed({ executionId }) {
				return { executionId, state: "current" as const, expiresAt: "2026-09-29T07:00:00Z" };
			},
			async recoverInitial() { throw new Error("fixture_owner_recovery_not_configured"); },
		},
		authorityDurationMs: 60_000, permissions: ["native.reserve"], signal: signal.signal,
		now: () => database.ctx.now, log: (message) => { logs.push(message); } });
	return { database, control, archive, behavior, requests, executionId, state, connect, signal, logs,
		async close() { signal.abort(); await server.stop(true); await database.db.$client.close(); rmSync(root, { recursive: true, force: true }); } };
}
