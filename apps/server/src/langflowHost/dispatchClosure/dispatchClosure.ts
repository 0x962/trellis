import { realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { BlockReason, DispatchBlock } from "../dispatchGate/contracts";
import { waitForDrain } from "../dispatchGate/drain/drain";
import { DispatchStore } from "../dispatchGate/store/store";

export class DispatchClosure {
	constructor(private readonly store: DispatchStore) {}

	static open(input: { directory: string; dataHomeId: string }) {
		const store = new DispatchStore(input.directory, input.dataHomeId);
		store.read();
		return new DispatchClosure(store);
	}

	read() {
		return this.store.read();
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
}
