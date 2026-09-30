import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import { protocolDigest } from "../../../langflowContracts";
import { LangflowHostControl } from "../../../langflowHost/hostControl";
import { ReceiptObjectStore } from "../../../langflowHost/objectStore";
import { type IsolatedRestoreInput, withIsolatedRestore } from "../../../langflowHost/restoreExclusion";
import { destinations } from "./components/destinations";
import { readRestoreSource } from "./components/readRestoreSource";

export type RestoreNativeSnapshotsInput = IsolatedRestoreInput & { signal: AbortSignal };
export type RestoredNativeSnapshotsResult = Awaited<ReturnType<typeof restoreNativeSnapshots>>;

export function restoreNativeSnapshots(input: RestoreNativeSnapshotsInput) {
	input.signal.throwIfAborted();
	return withIsolatedRestore(input, async (ctx) => {
		const source = await readRestoreSource(ctx.identity, input.block);
		const root = join(ctx.identity.home, "harness-attempts");
		return withRuntimeMutationExclusion(ctx.identity.home, [
			{ kind: "attempt-retention", directory: root },
			...[...source.inventory.files, ...source.inventory.unavailable].map((entry) => ({
				kind: "attempt" as const, directory: join(root, entry.attemptId),
			})),
		], async () => {
			input.signal.throwIfAborted();
			const current = await readRestoreSource(ctx.identity, input.block);
			if (!isDeepStrictEqual(current.intent, source.intent)) throw new Error("native_restore_source_changed");
			const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(ctx.identity.home), "restored-native"));
			const intentId = objects.write(JSON.stringify(source.intent));
			objects.bind("intent", intentId);
			const files = await destinations(current, true, input.signal);
			await ctx.assertClosed();
			input.signal.throwIfAborted();
			const record = {
				version: 1 as const,
				kind: "native-snapshot-install-receipt" as const,
				intent: source.intent,
				files,
				unavailable: current.inventory.unavailable,
				complete: current.inventory.ready,
				state: "requires-reconciliation" as const,
			};
			const sourceBytes = JSON.stringify(record);
			const receiptId = objects.write(sourceBytes);
			objects.bind("installation", receiptId);
			return { receiptId, sourceBytes, sourceDigest: protocolDigest(sourceBytes), record };
		}, input.signal);
	});
}
