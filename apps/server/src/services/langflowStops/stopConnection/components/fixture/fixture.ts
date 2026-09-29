import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import { eq } from "drizzle-orm";
import { SYSTEM_ACTOR } from "../../../../../context";
import { ids, now } from "../../../../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../../../../db/queries/langflowExecution/fixtures/native";
import { langflowExecutions } from "../../../../../db/tables/langflowExecution";
import { protocolDigest } from "../../../../../langflowContracts";
import { DispatchReceiptArchive, LangflowHostControl, type LiveOwnership } from "../../../../../langflowHost";
import { PrivateState } from "../../../../../langflowHost/privateState";
import { stopFixture } from "../../../../langflowTestFixture";
import type { EngineCancellationStatus } from "../../../cancellationEngine";
import { cancelView } from "../../../cancelView";
import { readCancellationReceipt } from "../../../readCancellationReceipt";
import { type StopStateCall, stopState } from "../../../stopState";
import { createStopConnection } from "../../stopConnection";

export async function connectionFixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-stop-connection-"));
	const home = join(root, "home");
	mkdirSync(home);
	let archive: DispatchReceiptArchive;
	const control = LangflowHostControl.create({
		home,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			async withReconciliation(block, id, commit) {
				commit({
					id,
					block,
					packageDigest: "a".repeat(64),
					trellisDatabaseReceiptId: "db",
					engineDatabaseReceiptId: "engine",
					secretReceiptId: "secret",
					ownershipReceiptId: "owner",
					nativeAttemptsReceiptId: "native",
					stopObligationsReceiptId: "stops",
					snapshotSealReceiptId: null,
				});
			},
		},
	});
	archive = DispatchReceiptArchive.open(control);
	await control.gate.reconcile(control.gate.read().block!, "fixture");
	const database = await stopFixture(true);
	const authority = {
		...database.authority,
		hostId: control.identity.hostId,
		permissions: [...database.authority.permissions, "execution.cancel" as const],
	};
	await database.run((tx) =>
		tx
			.update(langflowExecutions)
			.set({ hostId: control.identity.hostId, authority })
			.where(eq(langflowExecutions.executionId, ids.execution)),
	);
	archive.writeAuthority({ authorityBytes: JSON.stringify(authority), issuanceReceiptId: "fixture-authority" });
	await database.run((tx) => cancelView(database.core, tx, { id: ids.execution, expectedRevision: 1 }));
	const behavior = {
		status: "cancelled" as EngineCancellationStatus,
		unavailable: false,
		lost: false,
		stopFails: false,
		wrongAttempt: false,
		corruptReceipt: false,
		engineCalls: 0,
		stopped: [] as string[],
		at: now,
	};
	const state: StopStateCall = (input) =>
		database.run((tx) => stopState({ ...database.core, actor: SYSTEM_ACTOR, now: behavior.at }, tx, input));
	const receiptId = crypto.randomUUID();
	let authentication = "";
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			behavior.engineCalls++;
			expect(request.headers.get("authorization")).toBe(`Bearer ${authentication}`);
			expect(new URL(request.url).pathname).toBe("/trellis-v1/cancellation");
			const body = await request.json();
			const stored = await database.run((tx) =>
				readCancellationReceipt({ ...database.core, actor: SYSTEM_ACTOR }, tx, { executionId: ids.execution }),
			);
			expect(JSON.parse(body.cancelIntentBytes)).toEqual(stored.intent);
			expect(body.authorityBytes).toBe(archive.readAuthorityBytes(authority));
			if (behavior.lost) return new Response("lost response", { status: 503 });
			return Response.json({
				receipt: {
					version: 1,
					receiptId,
					requestId: body.requestId,
					executionId: behavior.corruptReceipt ? "another-execution" : body.executionId,
					engineJobId: body.engineJobId,
					cancelIntentDigest: protocolDigest(body.cancelIntentBytes),
					acceptedAt: now.toISOString(),
				},
				engineStatus: behavior.status,
			});
		},
	});
	const observation: LiveOwnership = {
		id: crypto.randomUUID(),
		observedAt: now.toISOString(),
		endpoint: server.url.origin,
		identity: {
			dataHomeId: control.identity.dataHomeId,
			hostId: control.identity.hostId,
			ownerId: authority.ownerId,
			instanceId: crypto.randomUUID(),
			manifestDigest: "c".repeat(64),
		},
	};
	const privateState = await PrivateState.open(home);
	await privateState.reserve(observation.identity);
	authentication = await Bun.file(privateState.authenticationFile(observation.identity)).text();
	const supervisor = {
		async withHealthyEngine<T>(action: (owner: LiveOwnership) => Promise<T>) {
			if (behavior.unavailable) throw new Error("engine_unavailable");
			return action(observation);
		},
	};
	const host = {
		async stop(attemptId: string): Promise<RuntimeSession> {
			behavior.stopped.push(attemptId);
			if (behavior.stopFails) throw new Error("runtime_unavailable");
			return {
				id: behavior.wrongAttempt ? crypto.randomUUID() : attemptId,
				daemonId: "runtime",
				pid: null,
				mode: "pty",
				status: "exited",
				startedAt: now.toISOString(),
				endedAt: now.toISOString(),
				exitCode: 0,
				error: null,
			};
		},
	};
	const signal = new AbortController();
	const logs: string[] = [];
	const connect = () =>
		createStopConnection({
			control,
			supervisor,
			archive,
			database: state,
			signal: signal.signal,
			now: () => behavior.at,
			log: (message) => {
				logs.push(message);
			},
			host,
		});
	return {
		root,
		home,
		control,
		archive,
		database,
		behavior,
		state,
		connect,
		logs,
		authority,
		handle,
		async close() {
			signal.abort();
			await server.stop(true);
			await database.db.$client.close();
			rmSync(root, { recursive: true, force: true });
		},
	};
}
