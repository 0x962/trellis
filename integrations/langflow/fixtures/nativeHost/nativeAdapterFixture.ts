import { spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { HarnessHost } from "../../../../apps/server/src/agents/harnessHost/harnessHost.ts";
import type { ServiceCtx } from "../../../../apps/server/src/context.ts";
import { createCache } from "../../../../apps/server/src/db/cache.ts";
import { openDatabase } from "../../../../apps/server/src/db/open.ts";
import { ids, now } from "../../../../apps/server/src/db/queries/langflowExecution/fixtures/fixture.ts";
import { nativeRequest } from "../../../../apps/server/src/db/queries/langflowExecution/fixtures/native.ts";
import type { Tx } from "../../../../apps/server/src/db/tx.ts";
import { type DeliveryAuthorityV1, protocolDigest } from "../../../../apps/server/src/langflowContracts";
import { DispatchGate } from "../../../../apps/server/src/langflowHost";
import {
	observeNativeAttempt,
	readReservation,
	recordNativeLaunch,
	recoverNativeAttempt,
	requestNativeAttempt,
	reserveNativeRequest,
	resolveNativeLimits,
} from "../../../../apps/server/src/services/langflowNative";
import type { IoCtx } from "../../../../apps/server/src/services/support.ts";
import { DeterministicProcessHost } from "./deterministicProcess.ts";

export async function openNativeAdapterFixture(home: string) {
	const { authority } = JSON.parse(await readFile(join(home, "adapter.json"), "utf8")) as {
		authority: DeliveryAuthorityV1;
	};
	const database = await openDatabase(join(home, "db"));
	const run = <T>(fn: (tx: Tx) => Promise<T>) => database.db.transaction(fn);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	const core: ServiceCtx = {
		actor: { kind: "human", name: "Native fixture" },
		session: null,
		reqId: crypto.randomUUID(),
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	const io = {
		core,
		actor: core.actor!,
		session: null,
		home,
		localUrl: core.publicUrl,
		now: () => now,
		newTx: run,
		emit: core.emit,
		log: () => {},
	} as IoCtx;
	const processes = await DeterministicProcessHost.create(join(home, "native-processes"), () => now.toISOString());
	const prepare = spyOn(HarnessHost.prototype, "prepare").mockImplementation(async (input) => ({
		fingerprint: JSON.stringify([input.harness, input.model, input.effort, null]),
		prompt: input.prompt,
		spec: { id: input.id, command: "fixture-agent", args: [], cwd: home, env: {}, mode: "pty" },
		harness: input.harness,
	}));
	const start = spyOn(HarnessHost.prototype, "start").mockImplementation((input) => processes.launch(input));
	const gateInput = {
		directory: join(home, "dispatch"),
		dataHomeId: "native-adapter-fixture",
		evidence: {
			async readTerminal(permit: Parameters<DispatchGate["settle"]>[0], receiptId: string) {
				const rows = await database.db.execute(sql`SELECT step_id,attempt_id,request_id,request_digest,launch_receipt
					FROM langflow_native_handles WHERE execution_id=${permit.binding.executionId}`);
				const match = rows.rows.find((row) => {
					const launch = row.launch_receipt as { launchReceiptId: string } | null;
					return permit.binding.attemptId === null
						? row.step_id === receiptId && row.request_id === permit.binding.requestId &&
							row.request_digest === permit.binding.payloadDigest
						: row.attempt_id === permit.binding.attemptId && launch?.launchReceiptId === receiptId &&
							row.request_digest === permit.binding.payloadDigest;
				});
				if (!match) throw new Error("fixture_dispatch_receipt_missing");
				return { id: receiptId, permit, outcome: "completed" as const };
			},
			async withReconciliation() {
				throw new Error("fixture_reconciliation_not_requested");
			},
		},
	};
	const dispatchGate = (await Bun.file(join(home, "dispatch", "dispatch.json")).exists())
		? DispatchGate.open(gateInput)
		: DispatchGate.create(gateInput);
	const requestBytes = JSON.stringify(nativeRequest);
	const ctx: Parameters<typeof requestNativeAttempt>[0] & Parameters<typeof observeNativeAttempt>[0] = {
		...io,
		dispatchGate,
		nativeAuthority: authority,
		async resolveOccurrence(_tx, input) {
			if (input.requestBytes !== requestBytes) throw new Error("fixture_occurrence_not_approved");
			return {
				requestDigest: protocolDigest(requestBytes),
				specHash: nativeRequest.specHash,
				taskKey: "root/501/review/step/51",
				name: "Native fixture",
				instruction: "Return the exact fixture result.",
				harness: { preset: "codex" },
				accountId: "native-adapter-account",
			};
		},
		resolveProcessLimits: (tx, input) => resolveNativeLimits(core, tx, input),
		recordObservedLaunch: (tx, input) => recordNativeLaunch(core, tx, input),
		async recordWorkspace(tx, input) {
			await tx.execute(sql`INSERT INTO native_adapter_workspace_fixture
				(step_id,attempt_id,workspace_id,workspace_commit)
				VALUES (${input.stepId},${input.attemptId},${input.workspaceId},${input.workspaceCommit})
				ON CONFLICT (step_id) DO UPDATE SET workspace_commit=excluded.workspace_commit`);
		},
	};
	const deps: Parameters<typeof requestNativeAttempt>[2] = {
		workspace: async () => home,
		runtime: async () => processes.client() as never,
		guide: async () => "Return the exact fixture result.",
		env: { CODEX_HOME: join(home, "unused-provider-profile") },
	};
	const input = (stepId: string) => ({ executionId: ids.execution, stepId });
	return {
		ctx,
		processes,
		dispatchGate,
		requestBytes,
		request: (bytes = requestBytes) => requestNativeAttempt(ctx, { requestBytes: bytes }, deps),
		reserve: () => run((tx) => reserveNativeRequest({ ...core, ...ctx, now }, tx, { requestBytes })),
		recover: (stepId: string) => recoverNativeAttempt(ctx, input(stepId), deps),
		observe: (stepId: string) => observeNativeAttempt(ctx, input(stepId), processes.client()),
		read: (stepId: string) => run((tx) => readReservation(tx, input(stepId))),
		counts: async () => {
			const result = await database.db.execute(sql`SELECT
				(SELECT count(*)::int FROM langflow_native_handles) AS handles,
				(SELECT count(*)::int FROM agent_execution_attempts) AS attempts,
				(SELECT count(*)::int FROM langflow_completions) AS completions`);
			return result.rows[0];
		},
		close: async () => {
			prepare.mockRestore();
			start.mockRestore();
			await database.close();
		},
	};
}
