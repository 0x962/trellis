import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DispatchEvidence } from "../dispatchGate";
import { LangflowHostControl } from "./hostControl";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const evidence: DispatchEvidence = {
	async readTerminal() {
		throw new Error("terminal_unavailable");
	},
	async withReconciliation(block, id, commit) {
		commit({
			id,
			block,
			packageDigest: "a".repeat(64),
			trellisDatabaseReceiptId: "db",
			engineDatabaseReceiptId: "engine",
			secretReceiptId: "secret",
			ownershipReceiptId: "owner",
			nativeAttemptsReceiptId: "attempts",
			stopObligationsReceiptId: "stops",
			snapshotSealReceiptId: null,
		});
	},
};
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-host-control-test-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	return { root, home, evidence };
}

test("production control initializes closed outside the home and retains identities on restart", async () => {
	const input = fixture();
	expect(LangflowHostControl.recovery(input.home)).toEqual({ state: "unavailable", generation: null });
	expect(() => LangflowHostControl.readIdentity(input.home)).toThrow();
	const control = LangflowHostControl.create(input);
	expect(LangflowHostControl.readIdentity(input.home)).toEqual(control.identity);
	expect(LangflowHostControl.directory(input.home)).toBe(`${realpathSync(input.home)}.langflow-authority`);
	expect(LangflowHostControl.recovery(input.home)).toEqual({ state: "blocked", generation: 1 });
	const restarted = LangflowHostControl.open(input);
	expect(restarted.identity).toEqual(control.identity);
	const block = restarted.gate.read().block;
	if (!block) throw new Error("missing_initial_block");
	expect(block.reason).toEqual({ kind: "initialize" });
	await restarted.gate.reconcile(block, "verified");
	expect(LangflowHostControl.recovery(input.home)).toEqual({ state: "open", generation: 2 });
	await restarted.gate.reconcile(block, "verified");
	expect(LangflowHostControl.recovery(input.home).generation).toBe(2);
	expect(() => LangflowHostControl.create(input)).toThrow();
});

test("lost control state never creates an open replacement", () => {
	const input = fixture();
	LangflowHostControl.create(input);
	unlinkSync(join(LangflowHostControl.directory(input.home), "dispatch", "dispatch.json"));
	expect(() => LangflowHostControl.open(input)).toThrow();
	expect(() => LangflowHostControl.recovery(input.home)).toThrow();
});

test("restored bytes cannot replace the external control or identity", () => {
	const input = fixture();
	const control = LangflowHostControl.create(input);
	rmSync(input.home, { recursive: true });
	mkdirSync(input.home);
	const restored = LangflowHostControl.open(input);
	expect(restored.identity).toEqual(control.identity);
	expect(LangflowHostControl.recovery(input.home).state).toBe("blocked");
});

test("public effects settle under a block without access to reconciliation", async () => {
	const input = fixture();
	const control = LangflowHostControl.create(input);
	const effects = LangflowHostControl.openEffects({
		home: input.home,
		readTerminal: async (permit, id) => ({ id, permit, outcome: "completed" }),
	});
	expect(effects.identity).toEqual(control.identity);
	expect("reconcile" in effects.gate).toBe(false);
	expect("closeDispatch" in effects.gate).toBe(false);
	const binding = {
		effectId: "cancel:one",
		kind: "cancellation" as const,
		executionId: "execution",
		attemptId: null,
		jobId: null,
		requestId: "request",
		payloadDigest: "a".repeat(64),
	};
	expect(() => effects.gate.acquire(binding)).toThrow("dispatch_blocked");
	const initial = control.gate.read().block;
	if (!initial) throw new Error("missing_initial_block");
	await control.gate.reconcile(initial, "initialized");
	const permit = effects.gate.acquire(binding);
	const block = control.gate.closeDispatch({
		requestId: "capture",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	const restarted = LangflowHostControl.openEffects({
		home: input.home,
		readTerminal: async (saved, id) => ({ id, permit: saved, outcome: "completed" }),
	});
	expect(restarted.gate.recoverPermit(binding)?.permit).toEqual(permit);
	await restarted.gate.settle(permit, "committed");
	await control.gate.waitForDrain(block);
	expect(control.gate.read().block).toEqual(block);
	expect(control.gate.recoverPermit(binding)?.terminal?.id).toBe("committed");
});

test("explicit initialization preserves the exact restore block with an independent target identity", () => {
	const input = fixture();
	const directory = join(input.root, "restore-envelope");
	mkdirSync(directory);
	const initialBlock = {
		requestId: crypto.randomUUID(),
		reason: {
			kind: "restore" as const,
			directory,
			snapshotId: "paired-snapshot",
			sourceDataHomeId: crypto.randomUUID(),
			manifestDigest: "a".repeat(64),
		},
	};
	const created = LangflowHostControl.initialize({ home: input.home, initialBlock });
	expect(created.identity.dataHomeId).not.toBe(initialBlock.reason.sourceDataHomeId);
	expect(created.block?.requestId).toBe(initialBlock.requestId);
	expect(created.block?.reason).toEqual({ ...initialBlock.reason, directory: realpathSync(directory) });
	expect(LangflowHostControl.open(input).gate.read().block).toEqual(created.block);
	expect(LangflowHostControl.recovery(input.home)).toEqual({ state: "blocked", generation: 1 });
	expect(() => LangflowHostControl.initialize({ home: input.home, initialBlock })).toThrow();
	expect(LangflowHostControl.readIdentity(input.home)).toEqual(created.identity);
});

test("the create constructor never exposes an open gate before a restore block", () => {
	const input = fixture();
	const directory = join(input.root, "envelope");
	mkdirSync(directory);
	const initialBlock = {
		requestId: crypto.randomUUID(),
		reason: {
			kind: "restore" as const,
			directory,
			snapshotId: "snapshot",
			sourceDataHomeId: "source",
			manifestDigest: "a".repeat(64),
		},
	};
	const control = LangflowHostControl.create({ ...input, initialBlock });
	expect(control.gate.read().permits).toEqual([]);
	expect(control.gate.read().block?.reason).toEqual({ ...initialBlock.reason, directory: realpathSync(directory) });
});

test("restore initialization refuses a target inside the recovery envelope", () => {
	const input = fixture();
	expect(() =>
		LangflowHostControl.initialize({
			home: input.home,
			initialBlock: {
				requestId: crypto.randomUUID(),
				reason: {
					kind: "restore",
					directory: input.root,
					snapshotId: "snapshot",
					sourceDataHomeId: "source",
					manifestDigest: "a".repeat(64),
				},
			},
		}),
	).toThrow("dispatch_control_inside_restore");
	expect(LangflowHostControl.recovery(input.home).state).toBe("unavailable");
});

test("capture control closes and drains durable effects without release authority", async () => {
	const input = fixture();
	const full = LangflowHostControl.create(input);
	const initial = full.gate.read().block;
	if (!initial) throw new Error("missing_initial_block");
	await full.gate.reconcile(initial, "initialized");
	const effects = LangflowHostControl.openEffects({
		home: input.home,
		readTerminal: async (permit, id) => ({ id, permit, outcome: "completed" }),
	});
	const permit = effects.gate.acquire({
		effectId: "capture-effect",
		kind: "cancellation",
		executionId: "execution",
		attemptId: null,
		jobId: null,
		requestId: "request",
		payloadDigest: "a".repeat(64),
	});
	const capture = LangflowHostControl.openCapture({ home: input.home });
	expect(capture.identity).toEqual(full.identity);
	for (const method of ["reconcile", "acquire", "settle", "recoverPermit"]) {
		expect(method in capture.gate).toBe(false);
	}
	const block = capture.gate.closeDispatch({
		requestId: "capture-only",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	expect(full.gate.read().block).toEqual(block);
	let drained = false;
	const wait = capture.gate.waitForDrain(block).then(() => {
		drained = true;
	});
	await Promise.resolve();
	expect(drained).toBe(false);
	await effects.gate.settle(permit, "committed");
	await wait;
	const reopened = LangflowHostControl.openCapture({ home: input.home });
	expect(reopened.gate.read().block).toEqual(block);
	expect(reopened.gate.closeDispatch({ requestId: block.requestId, reason: block.reason })).toEqual(block);
});

test("capture control refuses missing state without initialization", () => {
	const input = fixture();
	expect(() => LangflowHostControl.openCapture({ home: input.home })).toThrow();
	expect(LangflowHostControl.recovery(input.home).state).toBe("unavailable");
});
