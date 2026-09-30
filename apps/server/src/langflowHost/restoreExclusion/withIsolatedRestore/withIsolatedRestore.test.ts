import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockHome } from "../../../homeLock";
import { DispatchStore } from "../../dispatchGate/store/store";
import { LangflowHostControl } from "../../hostControl";
import { withIsolatedRestore } from "./withIsolatedRestore";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-isolated-restore-")));
	roots.push(root);
	const home = join(root, "target");
	const directory = join(root, "envelope");
	await mkdir(home, { mode: 0o700 });
	await mkdir(directory, { mode: 0o700 });
	const { identity, block } = LangflowHostControl.initialize({ home, initialBlock: {
		requestId: crypto.randomUUID(), reason: { kind: "restore", directory, snapshotId: crypto.randomUUID(),
			sourceDataHomeId: crypto.randomUUID(), manifestDigest: "a".repeat(64) },
	} });
	if (!block) throw new Error("fixture_block_missing");
	const store = new DispatchStore(join(LangflowHostControl.directory(home), "dispatch"), identity.dataHomeId);
	return { home, hostId: identity.hostId, dataHomeId: identity.dataHomeId, block, store };
}

test("all three locks remain held across the awaited callback", async () => {
	const f = await fixture();
	const result = await withIsolatedRestore(f, async ({ identity, privateRoot, assertClosed }) => {
		for (const directory of [identity.home, join(privateRoot, "supervisor"), f.store.directory])
			expect(() => lockHome(directory, "restore", null)).toThrow();
		await Promise.resolve();
		expect(() => f.store.mutate(() => "unexpected")).toThrow();
		await assertClosed();
		return "retained";
	});
	expect(result).toBe("retained");
	expect(f.store.mutate((state) => state.block)).toEqual(f.block);
	const lock = lockHome(f.home, "restore", null);
	lock.release();
});

test("callback failure releases owned locks and preserves its error", async () => {
	const f = await fixture();
	const error = new Error("synthetic_copy_failure");
	await expect(withIsolatedRestore(f, async () => { throw error; })).rejects.toBe(error);
	expect(f.store.mutate((state) => state.block)).toEqual(f.block);
	const lock = lockHome(f.home, "restore", null);
	lock.release();
});

test("foreign identities and changed restore blocks refuse the callback", async () => {
	const f = await fixture();
	for (const input of [
		{ ...f, hostId: crypto.randomUUID() },
		{ ...f, dataHomeId: crypto.randomUUID() },
		{ ...f, block: { ...f.block, generation: f.block.generation + 1 } },
	]) {
		let called = false;
		await expect(withIsolatedRestore(input, async () => { called = true; })).rejects.toThrow();
		expect(called).toBe(false);
	}
});

test("a retained process record refuses the offline scope", async () => {
	const f = await fixture();
	await mkdir(join(f.home, "langflow/supervisor"), { recursive: true, mode: 0o700 });
	await writeFile(join(f.home, "langflow/supervisor/process.json"), "{}", { mode: 0o600 });
	await expect(withIsolatedRestore(f, async () => "unexpected")).rejects.toThrow("process_record_present");
});

test("the final assertion rejects a process record created during the callback", async () => {
	const f = await fixture();
	await expect(withIsolatedRestore(f, async ({ privateRoot }) => {
		await writeFile(join(privateRoot, "supervisor/process.json"), "{}", { mode: 0o600 });
		return "not-accepted";
	})).rejects.toThrow("process_record_present");
	expect(f.store.mutate((state) => state.block)).toEqual(f.block);
});

test("an unsettled permit refuses the callback", async () => {
	const f = await fixture();
	f.store.mutate((state) => state.permits.push({ permit: {
		id: crypto.randomUUID(), dataHomeId: f.dataHomeId, generation: f.block.generation,
		binding: { effectId: "effect", kind: "native-dispatch", executionId: "execution", attemptId: "attempt",
			jobId: null, requestId: "request", payloadDigest: "a".repeat(64) },
	}, terminal: null }));
	await expect(withIsolatedRestore(f, async () => "unexpected")).rejects.toThrow("effects_pending");
});

test("an unresolved capture grant refuses the callback", async () => {
	const f = await fixture();
	const snapshotId = crypto.randomUUID();
	const grantBytes = JSON.stringify({
		version: 1, id: crypto.randomUUID(), snapshotId, boundaryReceiptId: "boundary",
		block: { ...f.block, reason: { kind: "capture", snapshotId } },
		identity: { hostId: f.hostId, dataHomeId: f.dataHomeId, ownerId: crypto.randomUUID(),
			instanceId: crypto.randomUUID(), manifestDigest: "a".repeat(64) },
	});
	f.store.mutate((state) => state.captureGrants.push({ grantBytes, phase: "issued", receipt: null }));
	await expect(withIsolatedRestore(f, async () => "unexpected")).rejects.toThrow("capture_pending");
});

test("an escaped assertion cannot claim an active restore scope", async () => {
	const f = await fixture();
	const assertClosed = await withIsolatedRestore(f, async (scope) => scope.assertClosed);
	await expect(assertClosed()).rejects.toThrow("home_lock_not_held");
});
