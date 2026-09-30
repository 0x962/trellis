import { expect, test } from "bun:test";
import type { RuntimeCaptureProducer, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { Tx } from "../../../../apps/server/src/db/tx";
import { withCaptureTransaction } from "../../../../apps/server/src/services/langflowBackup/withCaptureTransaction";

function fixture() {
	const events: string[] = [];
	let transaction = false;
	let held = false;
	const request: RuntimeCaptureRequest = { captureId: "capture", snapshotId: "snapshot", hostId: "host", dataHomeId: "home", generation: 1, blockId: "block", identities: [] };
	const producer: RuntimeCaptureProducer = {
		binding: { ...request, roots: [], workspaces: [] },
		async inventory(binding) { return { binding, entries: [], unavailable: [] }; },
		async *read() { yield* []; throw new Error("unexpected_read"); },
		async seal() { throw new Error("unexpected_seal"); },
	};
	const runtime: Pick<RuntimeClient, "withCaptureSnapshot"> = {
		async withCaptureSnapshot(_request, consume) {
			expect(transaction).toBe(false);
			events.push("acquire");
			held = true;
			try { return await consume(producer); }
			finally { expect(transaction).toBe(false); held = false; events.push("release"); }
		},
	};
	const newTx = async <T>(consume: (tx: Tx) => Promise<T>) => {
		expect(held).toBe(true);
		transaction = true;
		events.push("begin");
		try { const result = await consume({} as Tx); events.push("commit"); return result; }
		catch (error) { events.push("rollback"); throw error; }
		finally { transaction = false; }
	};
	return { request, runtime, newTx, events, assertHeld: () => { expect(held).toBe(true); expect(transaction).toBe(true); } };
}

test("acquires outside the transaction and holds through the aggregate seal", async () => {
	const f = fixture();
	const result = await withCaptureTransaction(f, f.request, async () => {
		for (const action of ["revalidate", "workspace", "conversation", "snapshot", "seal"]) {
			f.assertHeld(); f.events.push(action); await Promise.resolve();
		}
		return "sealed";
	});
	expect(result).toBe("sealed");
	expect(f.events).toEqual(["acquire", "begin", "revalidate", "workspace", "conversation", "snapshot", "seal", "commit", "release"]);
});

test("preserves an export failure and rolls back before the runtime scope ends", async () => {
	const f = fixture();
	const failure = new Error("seal_failed");
	await expect(withCaptureTransaction(f, f.request, async () => { f.assertHeld(); throw failure; })).rejects.toBe(failure);
	expect(f.events).toEqual(["acquire", "begin", "rollback", "release"]);
});

test("does not open a transaction when the runtime refuses capture", async () => {
	const f = fixture();
	f.runtime.withCaptureSnapshot = async () => { throw new Error("CAPTURE_UNAVAILABLE"); };
	await expect(withCaptureTransaction(f, f.request, async () => "unexpected")).rejects.toThrow("CAPTURE_UNAVAILABLE");
	expect(f.events).toEqual([]);
});
