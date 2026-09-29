import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { LangflowSidecarManifestV1Schema } from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import { readReconciliationFacts } from "../../db/queries/langflowExecution/reconciliationFacts";
import { langflowExecutions } from "../../db/tables/langflowExecution";
import { lockHome } from "../../homeLock";
import { protocolDigest } from "../../langflowContracts";
import { readPairedSeal } from "../../services/langflowBackup/readPairedSeal";
import { withNativeReconciliation } from "../../services/langflowNative/withNativeReconciliation";
import { withNativeSnapshotRetention } from "../../services/langflowNative/withNativeSnapshotRetention";
import { readStopReconciliation } from "../../services/langflowStops";
import type { IoCtx } from "../../services/support";
import type { ReconciliationReceipt } from "../dispatchGate";
import { LangflowHostControl } from "../hostControl";
import { ReceiptObjectStore } from "../objectStore";
import { DispatchReceiptArchive } from "../receiptArchive";
import { readRestoredDatabaseOpen } from "../restoredDatabase";
import { compareRetainedProof } from "./components/compare";
import { readHeldEngine } from "./components/engine";
import { readCurrentIdentity } from "./components/identity";
import { readActiveOwnership, readEngineOwnership, verifyOwnership } from "./components/ownership";
import type { HostReconciliationInput, HostReconciliationResult } from "./contracts";

export async function reconcileHostControl(
	ctx: IoCtx,
	input: HostReconciliationInput,
): Promise<HostReconciliationResult> {
	if (ctx.actor.kind !== "system" || input.bootId !== ctx.bootId)
		throw new Error("host_reconciliation_internal_scope_required");
	const manifest = LangflowSidecarManifestV1Schema.parse(input.manifest);
	if (manifest.qualification !== "verified" || manifest.target.kind !== "linux-oci")
		throw new Error("host_reconciliation_package_not_approved");
	await readCurrentIdentity(ctx.home, input);
	let archive: DispatchReceiptArchive;
	const control = LangflowHostControl.open({
		home: ctx.home,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			withReconciliation: async (block, id, commit) => {
				if (!isDeepStrictEqual(block, input.block)) throw new Error("host_reconciliation_block_conflict");
				const result = await withVerifiedProof((receipt) => {
					if (receipt.id !== id) throw new Error("host_reconciliation_sources_changed");
					commit(receipt);
				});
				if (result.state === "blocked") throw new Error(`host_reconciliation_${result.reason}`);
			},
		},
	});
	archive = DispatchReceiptArchive.open(control);
	const directory = join(LangflowHostControl.directory(ctx.home), "reconciliation");
	new ReceiptObjectStore(directory);
	const lock = lockHome(directory, "server", null);
	try {
		if (input.operation === "commit") {
			if (input.receiptId === null) throw new Error("host_reconciliation_receipt_required");
			const prior = control.gate.read().reconciliations.find((receipt) => receipt.id === input.receiptId);
			if (prior) {
				if (!isDeepStrictEqual(prior.block, input.block)) throw new Error("host_reconciliation_replay_conflict");
				return { state: "committed", receipt: prior };
			}
			assertClosed();
			await control.gate.reconcile(input.block, input.receiptId);
			const receipt = control.gate.read().reconciliations.find((value) => value.id === input.receiptId);
			if (!receipt) throw new Error("host_reconciliation_commit_missing");
			return { state: "committed", receipt };
		}
		if (input.receiptId !== null) throw new Error("host_reconciliation_prepare_receipt_unexpected");
		const result = await withVerifiedProof();
		return result.state === "blocked" ? result : { state: "prepared", receipt: result.value };
	} finally {
		lock.release();
	}

	function assertClosed() {
		const state = control.gate.read();
		if (!isDeepStrictEqual(state.block, input.block)) throw new Error("host_reconciliation_block_changed");
		if (state.permits.some((entry) => entry.terminal === null)) throw new Error("host_reconciliation_effect_pending");
		if (state.captureGrants.some((record) => record.phase !== "revoked" || record.receipt?.state !== "revoked"))
			throw new Error("host_reconciliation_capture_not_revoked");
	}

	async function withVerifiedProof(commit?: (receipt: ReconciliationReceipt) => void) {
		assertClosed();
		const restoreDirectory = join(LangflowHostControl.directory(ctx.home), "restored-database");
		const restoreLock = input.block.reason.kind === "restore" ? lockHome(restoreDirectory, "restore", null) : null;
		try {
			const opened = input.block.reason.kind !== "restore" || input.openedDatabaseReceiptId === null
				? null
				: readRestoredDatabaseOpen({
					home: ctx.home,
					bootId: ctx.bootId,
					receiptId: input.openedDatabaseReceiptId,
				});
			const signal = new AbortController().signal;
			const engine = await readHeldEngine(ctx.home, input, signal);
			const empty = input.block.reason.kind === "initialize" ? await engine.readEmpty() : null;
			if (empty && !empty.empty) return { state: "blocked" as const, reason: "engine_not_empty" };
			const seal = input.block.reason.kind === "initialize"
				? null
				: await readPairedSeal({ control }, { snapshotId: input.block.reason.snapshotId });
			if (seal?.manifest.unavailable.length)
				return { state: "blocked" as const, reason: "snapshot_unavailable" };
			return await withNativeReconciliation({
				home: ctx.home,
				newTx: ctx.newTx,
				control,
				withSnapshotRetention: withNativeSnapshotRetention,
			}, { block: input.block }, async (native) => {
				const before = await ctx.newTx(readActiveOwnership);
				const authorities = await readEngineOwnership(before, engine);
				return ctx.newTx(async (tx) => {
					const ownership = await verifyOwnership(tx, input, before, authorities, archive, ctx.now());
					const facts = await readReconciliationFacts(tx);
					const stops = await readStopReconciliation(ctx.core, tx, {
						dataHomeId: input.block.dataHomeId,
						blockId: input.block.id,
						generation: input.block.generation,
					});
					if (input.block.reason.kind === "initialize" && (await tx.select().from(langflowExecutions)).length)
						throw new Error("host_reconciliation_initial_database_not_empty");
					compareRetainedProof({
						input, trellisRelease: ctx.version, facts, engine, native: native.manifest, stops, seal, opened,
					});
					await readCurrentIdentity(ctx.home, input);
					assertClosed();
					if (before.some((row) => row.authority && Date.parse(row.authority.expiresAt) <= ctx.now().getTime()))
						throw new Error("host_reconciliation_authority_expired");
					const source = (value: unknown) => {
						const sourceBytes = JSON.stringify(value);
						return { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
					};
					const receipt = archive.writeReconciliation({
						block: input.block,
						packageDigest: input.enginePackageDigest,
						sources: {
							trellisDatabase: source({ facts, opened: opened?.sourceBytes ?? null }),
							engineDatabase: source({ lease: engine.sourceBytes, empty: empty?.sourceBytes ?? null }),
							secret: source(engine.record.identity.secret),
							ownership,
							nativeAttempts: source(native.manifest),
							stopObligations: { sourceBytes: stops.sourceBytes, sourceDigest: stops.receiptId },
							snapshotSeal: seal?.sources.snapshotSeal ?? null,
						},
					});
					commit?.(receipt);
					return receipt;
				});
			});
		} finally {
			restoreLock?.release();
		}
	}
}
