import { realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { BlockReason, DispatchBlock, DispatchEvidence, DispatchPermit, EffectBinding } from "./contracts";
import { waitForDrain } from "./drain/drain";
import { ReconciliationReceiptSchema, TerminalReceiptSchema } from "./store/schema";
import { DispatchStore } from "./store/store";

export class DispatchGate {
	private constructor(
		private readonly store: DispatchStore,
		private readonly evidence: DispatchEvidence,
	) {}

	static create(input: { directory: string; dataHomeId: string; evidence: DispatchEvidence }) {
		return new DispatchGate(DispatchStore.create(input.directory, input.dataHomeId), input.evidence);
	}

	static open(input: { directory: string; dataHomeId: string; evidence: DispatchEvidence }) {
		const store = new DispatchStore(input.directory, input.dataHomeId);
		store.read();
		return new DispatchGate(store, input.evidence);
	}

	read() {
		return this.store.read();
	}

	assertDispatchAllowed() {
		const state = this.read();
		if (state.block) throw new Error("dispatch_blocked");
		return { dataHomeId: state.dataHomeId, generation: state.generation };
	}

	acquire(binding: EffectBinding): DispatchPermit {
		return this.store.mutate((state) => {
			if (state.block) throw new Error("dispatch_blocked");
			if (state.permits.some((entry) => entry.permit.binding.effectId === binding.effectId)) {
				throw new Error("dispatch_effect_already_reserved");
			}
			const permit = { id: crypto.randomUUID(), dataHomeId: state.dataHomeId, generation: state.generation, binding };
			state.permits.push({ permit, terminal: null });
			return structuredClone(permit);
		});
	}

	async settle(permit: DispatchPermit, receiptId: string) {
		const receipt = TerminalReceiptSchema.parse(await this.evidence.readTerminal(structuredClone(permit), receiptId));
		if (receipt.id !== receiptId || !isDeepStrictEqual(receipt.permit, permit)) {
			throw new Error("dispatch_terminal_mismatch");
		}
		this.store.mutate((state) => {
			const entry = state.permits.find((item) => item.permit.id === permit.id);
			if (!entry || !isDeepStrictEqual(entry.permit, permit)) throw new Error("dispatch_permit_mismatch");
			if (entry.terminal && !isDeepStrictEqual(entry.terminal, receipt)) throw new Error("dispatch_terminal_conflict");
			entry.terminal = receipt;
		});
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
				state.reconciliations.push(receipt);
				state.block = null;
				state.generation += 1;
			});
			committed = true;
		});
		if (!committed) throw new Error("dispatch_reconciliation_not_committed");
	}
}
