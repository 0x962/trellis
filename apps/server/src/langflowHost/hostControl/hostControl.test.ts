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
