import { watch } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { DispatchBlock } from "../contracts";
import type { DispatchStore } from "../store/store";

export function waitForDrain(store: DispatchStore, block: DispatchBlock, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const watcher = watch(store.directory, inspect);
		const finish = (error?: unknown) => {
			watcher.close();
			signal?.removeEventListener("abort", aborted);
			if (error) reject(error);
			else resolve();
		};
		const aborted = () => finish(signal?.reason ?? new Error("dispatch_drain_aborted"));
		function inspect() {
			try {
				const state = store.read();
				if (!isDeepStrictEqual(state.block, block)) throw new Error("dispatch_block_changed");
				if (state.permits.every((entry) => entry.terminal !== null)) finish();
			} catch (error) {
				finish(error);
			}
		}
		watcher.on("error", finish);
		signal?.addEventListener("abort", aborted, { once: true });
		if (signal?.aborted) aborted();
		else inspect();
	});
}
