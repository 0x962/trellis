import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchBlock } from "../../../langflowHost/dispatchGate";
import { DispatchStore } from "../../../langflowHost/dispatchGate/store/store";
import { LangflowHostControl } from "../../../langflowHost/hostControl";
import { destinations } from "./components/destinations";
import { privateDirectory, privateFile } from "./components/privateFile";
import { readRestoreSource } from "./components/readRestoreSource";

export async function readRestoredNativeSnapshots(input: { home: string; receiptId: string; block: DispatchBlock; signal: AbortSignal }) {
	input.signal.throwIfAborted();
	const receiptId = z.string().regex(/^[a-f0-9]{64}$/).parse(input.receiptId);
	const identity = LangflowHostControl.readIdentity(input.home);
	const control = LangflowHostControl.directory(identity.home);
	const store = new DispatchStore(join(control, "dispatch"), identity.dataHomeId);
	const assertClosed = () => {
		const state = store.read();
		if (!isDeepStrictEqual(state.block, input.block) || input.block.reason.kind !== "restore" ||
			state.permits.some((entry) => entry.terminal === null) ||
			!isDeepStrictEqual(LangflowHostControl.readIdentity(input.home), identity))
			throw new Error("native_restore_block_conflict");
	};
	assertClosed();
	const directory = join(control, "restored-native");
	await privateDirectory(directory);
	const sourceBytes = (await privateFile(join(directory, `${receiptId}.json`))).text;
	if (protocolDigest(sourceBytes) !== receiptId) throw new Error("native_restore_receipt_conflict");
	const binding = JSON.parse((await privateFile(join(directory, `binding-${protocolDigest("installation")}.json`))).text);
	if (!isDeepStrictEqual(binding, { key: "installation", id: receiptId })) throw new Error("native_restore_receipt_conflict");
	const source = await readRestoreSource(identity, input.block);
	const intentBytes = JSON.stringify(source.intent);
	const intentId = protocolDigest(intentBytes);
	const intentBinding = JSON.parse((await privateFile(join(directory, `binding-${protocolDigest("intent")}.json`))).text);
	if (!isDeepStrictEqual(intentBinding, { key: "intent", id: intentId }) ||
		(await privateFile(join(directory, `${intentId}.json`))).text !== intentBytes)
		throw new Error("native_restore_intent_conflict");
	const record = {
		version: 1 as const,
		kind: "native-snapshot-install-receipt" as const,
		intent: source.intent,
		files: await destinations(source, false, input.signal),
		unavailable: source.inventory.unavailable,
		complete: source.inventory.ready,
		state: "requires-reconciliation" as const,
	};
	if (!isDeepStrictEqual(JSON.parse(sourceBytes), record)) throw new Error("native_restore_receipt_conflict");
	assertClosed();
	input.signal.throwIfAborted();
	return { receiptId, sourceBytes, sourceDigest: protocolDigest(sourceBytes), record };
}
