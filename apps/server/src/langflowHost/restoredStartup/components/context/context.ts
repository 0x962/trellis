import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DispatchStore } from "../../../dispatchGate/store/store";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";
import type { RestoredEngineInput } from "../../../restoredEngine";

export function restoredStartupContext(home: string) {
	const identity = LangflowHostControl.readIdentity(home);
	const directory = LangflowHostControl.directory(home);
	const store = new DispatchStore(join(directory, "dispatch"), identity.dataHomeId);
	const objectDirectory = join(directory, "restored-engine");
	if (!lstatSync(objectDirectory).isDirectory()) throw new Error("restored_startup_receipts_unavailable");
	const objects = new ReceiptObjectStore(objectDirectory);
	const privateRoot = join(identity.home, "langflow");
	return { identity, store, objects, privateRoot };
}

export function assertStartupClosed(ctx: ReturnType<typeof restoredStartupContext>, input: RestoredEngineInput) {
	const state = ctx.store.read();
	if (state.block?.reason.kind !== "restore" || !isDeepStrictEqual(state.block, input.block) ||
		ctx.identity.hostId !== input.hostId || ctx.identity.dataHomeId !== input.dataHomeId ||
		!isDeepStrictEqual(LangflowHostControl.readIdentity(input.home), ctx.identity))
		throw new Error("restored_startup_block_changed");
	if (state.permits.some((entry) => !entry.terminal) || state.captureGrants.some((entry) => entry.phase !== "revoked"))
		throw new Error("restored_startup_effects_pending");
}

export function restoreStartupRequired(home: string) {
	if (!existsSync(LangflowHostControl.directory(home))) return false;
	const identity = LangflowHostControl.readIdentity(home);
	const store = new DispatchStore(join(LangflowHostControl.directory(home), "dispatch"), identity.dataHomeId);
	return store.read().block?.reason.kind === "restore";
}
