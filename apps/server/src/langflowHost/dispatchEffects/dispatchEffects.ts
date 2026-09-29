import { isDeepStrictEqual } from "node:util";
import type { DispatchEvidence, DispatchPermit, EffectBinding } from "../dispatchGate/contracts";
import { TerminalReceiptSchema } from "../dispatchGate/store/schema";
import { DispatchStore } from "../dispatchGate/store/store";

export class DispatchEffects {
	protected constructor(
		protected readonly store: DispatchStore,
		private readonly readTerminal: DispatchEvidence["readTerminal"],
	) {}

	static openEffects(input: { directory: string; dataHomeId: string; readTerminal: DispatchEvidence["readTerminal"] }) {
		const store = new DispatchStore(input.directory, input.dataHomeId);
		store.read();
		return new DispatchEffects(store, input.readTerminal);
	}

	read() {
		return this.store.read();
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

	recoverPermit(binding: EffectBinding) {
		const entry = this.read().permits.find((item) => item.permit.binding.effectId === binding.effectId);
		if (!entry) return null;
		if (!isDeepStrictEqual(entry.permit.binding, binding)) throw new Error("dispatch_effect_binding_conflict");
		return entry;
	}

	async settle(permit: DispatchPermit, receiptId: string) {
		const receipt = TerminalReceiptSchema.parse(await this.readTerminal(structuredClone(permit), receiptId));
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
}
