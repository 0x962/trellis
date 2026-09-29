import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	DispatchBlock,
	DispatchEvidence,
	DispatchPermit,
	EffectBinding,
	ReconciliationReceipt,
} from "./contracts";
import { DispatchGate } from "./dispatchGate";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const binding = (effectId = "effect"): EffectBinding => ({
	effectId,
	kind: "native-dispatch",
	executionId: "execution",
	attemptId: "attempt",
	jobId: "job",
	requestId: "request",
	payloadDigest: "a".repeat(64),
});
const reconciliation = (block: DispatchBlock, id: string): ReconciliationReceipt => ({
	id,
	block,
	packageDigest: "b".repeat(64),
	trellisDatabaseReceiptId: "trellis-db",
	engineDatabaseReceiptId: "engine-db",
	secretReceiptId: "secret",
	ownershipReceiptId: "owner",
	nativeAttemptsReceiptId: "attempts",
	stopObligationsReceiptId: "stops",
	snapshotSealReceiptId: "seal",
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-dispatch-test-"));
	roots.push(root);
	const terminals = new Map<string, DispatchPermit>();
	const evidence: DispatchEvidence = {
		async readTerminal(_permit, id) {
			const stored = terminals.get(id);
			if (!stored) throw new Error("terminal_unknown");
			return { id, permit: stored, outcome: "completed" };
		},
		async withReconciliation(block, id, commit) {
			commit(reconciliation(block, id));
		},
	};
	const input = { directory: join(root, "control"), dataHomeId: "target-home", evidence };
	return { root, input, evidence, terminals, gate: DispatchGate.create(input) };
}

test("a block closes new effects and waits while existing effects can save terminal receipts", async () => {
	const f = fixture();
	const permit = f.gate.acquire(binding());
	let drained = false;
	const pending = f.gate
		.blockDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "snapshot" } })
		.then((block) => {
			drained = true;
			return block;
		});
	await Promise.resolve();
	expect(drained).toBe(false);
	expect(() => f.gate.acquire(binding("later"))).toThrow("dispatch_blocked");
	f.terminals.set("terminal", permit);
	await f.gate.settle(permit, "terminal");
	const block = await pending;
	expect(drained).toBe(true);
	expect(block.generation).toBeGreaterThan(permit.generation);
	expect(() => f.gate.assertDispatchAllowed()).toThrow("dispatch_blocked");
	await f.gate.reconcile(block, "reconciled");
	expect(f.gate.acquire(binding("later")).generation).toBeGreaterThan(block.generation);
	expect(() => f.gate.acquire(binding())).toThrow("dispatch_effect_already_reserved");
});

test("unknown results and an aborted drain survive reopening without releasing permits", async () => {
	const f = fixture();
	const permit = f.gate.acquire(binding());
	await expect(f.gate.settle(permit, "unknown")).rejects.toThrow("terminal_unknown");
	const controller = new AbortController();
	controller.abort(new Error("deadline"));
	await expect(
		f.gate.blockDispatch({
			requestId: "capture",
			reason: { kind: "capture", snapshotId: "s" },
			signal: controller.signal,
		}),
	).rejects.toThrow("deadline");
	const reopened = DispatchGate.open(f.input);
	expect(reopened.read().permits[0]?.terminal).toBeNull();
	expect(() => reopened.acquire(binding("late"))).toThrow("dispatch_blocked");
	expect(() => DispatchGate.open({ ...f.input, dataHomeId: "another-home" })).toThrow("dispatch_home_mismatch");
	expect(() => DispatchGate.create(f.input)).toThrow();
});

test("a terminal receipt cannot settle another exact job, attempt, request, or generation", async () => {
	const f = fixture();
	const permit = f.gate.acquire(binding());
	for (const field of ["jobId", "attemptId", "requestId"] as const) {
		f.terminals.set("terminal", { ...permit, binding: { ...permit.binding, [field]: "different" } });
		await expect(f.gate.settle(permit, "terminal")).rejects.toThrow("dispatch_terminal_mismatch");
	}
	f.terminals.set("terminal", { ...permit, generation: permit.generation + 1 });
	await expect(f.gate.settle(permit, "terminal")).rejects.toThrow("dispatch_terminal_mismatch");
	expect(f.gate.read().permits[0]?.terminal).toBeNull();
});

test("restore retains the envelope and source identity separately from the target home", async () => {
	const f = fixture();
	const envelope = join(f.root, "recovery");
	mkdirSync(envelope);
	const reason = {
		kind: "restore" as const,
		directory: envelope,
		snapshotId: "snapshot",
		sourceDataHomeId: "source-home",
		manifestDigest: "c".repeat(64),
	};
	const block = await f.gate.blockDispatch({ requestId: "restore", reason });
	expect(block.dataHomeId).toBe("target-home");
	expect(block.reason).toEqual({ ...reason, directory: realpathSync(envelope) });
	expect(f.gate.closeDispatch({ requestId: "restore", reason })).toEqual(block);
	expect(() => f.gate.closeDispatch({ requestId: "restore", reason: { ...reason, snapshotId: "other" } })).toThrow(
		"dispatch_block_conflict",
	);
	await f.gate.reconcile(block, "restored");
	expect(() => f.gate.closeDispatch({ requestId: "restore", reason })).toThrow("dispatch_block_already_reconciled");
});

test("release requires the exact block, seal, and a committed reconciliation callback", async () => {
	const f = fixture();
	const block = await f.gate.blockDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "s" } });
	f.evidence.withReconciliation = async (b, id, commit) =>
		commit({ ...reconciliation(b, id), block: { ...b, generation: 8 } });
	await expect(f.gate.reconcile(block, "r")).rejects.toThrow("dispatch_reconciliation_mismatch");
	f.evidence.withReconciliation = async (b, id, commit) =>
		commit({ ...reconciliation(b, id), snapshotSealReceiptId: null });
	await expect(f.gate.reconcile(block, "r")).rejects.toThrow("dispatch_snapshot_not_sealed");
	f.evidence.withReconciliation = async () => {};
	await expect(f.gate.reconcile(block, "r")).rejects.toThrow("dispatch_reconciliation_not_committed");
	expect(() => f.gate.acquire(binding())).toThrow("dispatch_blocked");
});

test("two processes cannot authorize the same effect", async () => {
	const f = fixture();
	const script = `import { DispatchGate } from ${JSON.stringify(join(import.meta.dir, "dispatchGate.ts"))};
	const gate = DispatchGate.open({directory:process.argv[1],dataHomeId:"target-home",evidence:{}});
	gate.acquire(${JSON.stringify(binding())});`;
	const children = [0, 1].map(() =>
		Bun.spawn([process.execPath, "-e", script, f.input.directory], { stdout: "pipe", stderr: "pipe" }),
	);
	const outcomes = await Promise.all(
		children.map(async (child) => ({ code: await child.exited, error: await new Response(child.stderr).text() })),
	);
	expect(outcomes.filter((result) => result.code === 0)).toHaveLength(1);
	expect(outcomes.find((result) => result.code !== 0)?.error).toMatch(
		/dispatch_effect_already_reserved|HomeLockedError/,
	);
	expect(f.gate.read().permits).toHaveLength(1);
});

test("a process exit retains its permit and another process can settle it during drain", async () => {
	const f = fixture();
	const modulePath = JSON.stringify(join(import.meta.dir, "dispatchGate.ts"));
	const acquire = Bun.spawn(
		[
			process.execPath,
			"-e",
			`import {DispatchGate} from ${modulePath};
	DispatchGate.open({directory:process.argv[1],dataHomeId:"target-home",evidence:{}}).acquire(${JSON.stringify(binding())});
	process.exit(0);`,
			f.input.directory,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(await acquire.exited).toBe(0);
	const permit = f.gate.read().permits[0]?.permit;
	expect(permit).toBeDefined();
	const drain = f.gate.blockDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "s" } });
	const settle = Bun.spawn(
		[
			process.execPath,
			"-e",
			`import {DispatchGate} from ${modulePath};
	const evidence={readTerminal:async(permit,id)=>({id,permit,outcome:"completed"})};
	await DispatchGate.open({directory:process.argv[1],dataHomeId:"target-home",evidence}).settle(${JSON.stringify(permit)},"terminal");`,
			f.input.directory,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(await settle.exited).toBe(0);
	await drain;
	expect(f.gate.read().permits[0]?.terminal?.id).toBe("terminal");
});
