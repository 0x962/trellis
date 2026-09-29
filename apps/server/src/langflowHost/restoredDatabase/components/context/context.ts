import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DispatchBlock } from "../../../dispatchGate";
import { DispatchStore } from "../../../dispatchGate/store/store";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";

export function context(home: string) {
	const identity = LangflowHostControl.readIdentity(home);
	const controlDirectory = LangflowHostControl.directory(home);
	const directory = join(controlDirectory, "restored-database");
	const objects = new ReceiptObjectStore(directory);
	const store = new DispatchStore(join(controlDirectory, "dispatch"), identity.dataHomeId);
	return { identity, directory, objects, store };
}

export function closed(ctx: ReturnType<typeof context>, block?: DispatchBlock) {
	const state = ctx.store.read();
	if (!state.block || state.block.reason.kind !== "restore" || (block && !isDeepStrictEqual(state.block, block))) {
		throw new Error("restored_database_block_changed");
	}
	if (state.permits.some((entry) => !entry.terminal)) throw new Error("restored_database_effects_pending");
	if (!isDeepStrictEqual(LangflowHostControl.readIdentity(ctx.identity.home), ctx.identity)) {
		throw new Error("restored_database_home_changed");
	}
	return state.block;
}
