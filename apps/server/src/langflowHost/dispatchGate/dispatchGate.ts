import { realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { DispatchEffects } from "../dispatchEffects";
import type { BlockReason, DispatchBlock, DispatchEvidence } from "./contracts";
import { waitForDrain } from "./drain/drain";
import { ReconciliationReceiptSchema } from "./store/schema";
import { DispatchStore } from "./store/store";

export class DispatchGate extends DispatchEffects {
	private constructor(
		store: DispatchStore,
		private readonly evidence: DispatchEvidence,
	) {
		super(store, (permit, id) => evidence.readTerminal(permit, id));
	}

	static create(input: {
		directory: string;
		dataHomeId: string;
		evidence: DispatchEvidence;
		initialBlock?: { requestId: string; reason: BlockReason };
	}) {
		return new DispatchGate(
			DispatchStore.create(input.directory, input.dataHomeId, input.initialBlock),
			input.evidence,
		);
	}

	static open(input: { directory: string; dataHomeId: string; evidence: DispatchEvidence }) {
		const store = new DispatchStore(input.directory, input.dataHomeId);
		store.read();
		return new DispatchGate(store, input.evidence);
	}

	assertDispatchAllowed() {
		const state = this.read();
		if (state.block) throw new Error("dispatch_blocked");
		return { dataHomeId: state.dataHomeId, generation: state.generation };
	}

	closeDispatch(input: { requestId: string; reason: BlockReason }): DispatchBlock {
		const reason = structuredClone(input.reason);
		if (reason.kind === "restore") {
			reason.directory = realpathSync(reason.directory);
			if (this.store.directory === reason.directory || this.store.directory.startsWith(`${reason.directory}/`)) {
				throw new Error("dispatch_control_inside_restore");
			}
		}
		return this.store.mutate((state) => {
			if (state.reconciliations.some((receipt) => receipt.block.requestId === input.requestId)) {
				throw new Error("dispatch_block_already_reconciled");
			}
			if (state.block) {
				if (state.block.requestId !== input.requestId || !isDeepStrictEqual(state.block.reason, reason)) {
					throw new Error("dispatch_block_conflict");
				}
				return structuredClone(state.block);
			}
			state.generation += 1;
			state.block = {
				id: crypto.randomUUID(),
				dataHomeId: state.dataHomeId,
				generation: state.generation,
				requestId: input.requestId,
				reason,
			};
			return structuredClone(state.block);
		});
	}

	waitForDrain(block: DispatchBlock, signal?: AbortSignal) {
		return waitForDrain(this.store, block, signal);
	}

	async blockDispatch(input: { requestId: string; reason: BlockReason; signal?: AbortSignal }) {
		const block = this.closeDispatch(input);
		await this.waitForDrain(block, input.signal);
		return block;
	}

	async reconcile(block: DispatchBlock, receiptId: string) {
		const prior = this.read().reconciliations.find((receipt) => receipt.block.id === block.id);
		if (prior) {
			if (prior.id !== receiptId || !isDeepStrictEqual(prior.block, block)) {
				throw new Error("dispatch_reconciliation_conflict");
			}
			return;
		}
		await this.waitForDrain(block);
		let committed = false;
		await this.evidence.withReconciliation(structuredClone(block), receiptId, (untrusted) => {
			const receipt = ReconciliationReceiptSchema.parse(untrusted);
			if (receipt.id !== receiptId || !isDeepStrictEqual(receipt.block, block)) {
				throw new Error("dispatch_reconciliation_mismatch");
			}
			if (block.reason.kind === "capture" && !receipt.snapshotSealReceiptId) {
				throw new Error("dispatch_snapshot_not_sealed");
			}
			this.store.mutate((state) => {
				if (!isDeepStrictEqual(state.block, block)) throw new Error("dispatch_block_changed");
				if (state.permits.some((entry) => !entry.terminal)) throw new Error("dispatch_effects_pending");
				if (state.captureGrants.some((entry) => entry.phase !== "revoked" || entry.receipt?.state !== "revoked"))
					throw new Error("dispatch_capture_not_revoked");
				state.reconciliations.push(receipt);
				state.block = null;
				state.generation += 1;
			});
			committed = true;
		});
		if (!committed) throw new Error("dispatch_reconciliation_not_committed");
	}
}
