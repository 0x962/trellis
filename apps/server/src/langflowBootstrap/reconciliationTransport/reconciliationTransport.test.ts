import { expect, test } from "bun:test";
import { type HostReconciliationInput, type HostReconciliationResult, reconcileHostControl } from "../../langflowHost";
import { manifest } from "../../langflowHost/fixtures/manifest";
import * as agentTerminal from "../../services/agentRuns/terminal";
import { services } from "../../services/registry";
import { reconciliationTransport } from "./reconciliationTransport";

const digest = "a".repeat(64);
const uuid = "10000000-0000-4000-8000-000000000001";
const input: HostReconciliationInput = {
	operation: "prepare",
	block: {
		id: uuid,
		dataHomeId: uuid,
		requestId: uuid,
		generation: 1,
		reason: {
			kind: "restore",
			directory: "/fixture/envelope",
			snapshotId: uuid,
			sourceDataHomeId: "source-home",
			manifestDigest: digest,
		},
	},
	bootId: uuid,
	manifest,
	enginePackageDigest: digest,
	engineConfigSha256: digest,
	observation: {
		id: uuid,
		identity: { dataHomeId: uuid, hostId: uuid, ownerId: uuid, instanceId: uuid, manifestDigest: digest },
		observedAt: "2026-09-29T00:00:00.000Z",
		endpoint: "http://127.0.0.1:7860",
	},
	openedDatabaseReceiptId: "b".repeat(64),
	receiptId: null,
};

const prepared: HostReconciliationResult = {
	state: "prepared",
	receipt: {
		id: "c".repeat(64),
		block: input.block,
		packageDigest: digest,
		trellisDatabaseReceiptId: "d".repeat(64),
		engineDatabaseReceiptId: "e".repeat(64),
		secretReceiptId: "f".repeat(64),
		ownershipReceiptId: "1".repeat(64),
		nativeAttemptsReceiptId: "2".repeat(64),
		stopObligationsReceiptId: "3".repeat(64),
		snapshotSealReceiptId: "4".repeat(64),
	},
};

test("reconciliation registers the real domain before the automatic result transaction", () => {
	const entry = services["langflowHost.reconcile"];
	expect(entry.family).toBe("io");
	expect(entry.kind).toBe("mutation");
	if (!("prepare" in entry)) throw new Error("reconciliation_prepare_missing");
	expect(entry.prepare).toBe(reconcileHostControl);
	expect(entry.run).toBe(agentTerminal.result);
});

test("prepare and commit preserve the opened receipt and returned receipts under system context", async () => {
	const committed: HostReconciliationResult = { state: "committed", receipt: prepared.receipt };
	const calls: unknown[] = [];
	const port = reconciliationTransport({
		call: async (name, context, value) => {
			calls.push({ name, context, value });
			return calls.length === 1 ? prepared : committed;
		},
	});
	expect(calls).toHaveLength(0);
	expect(await port.reconcileHostControl(input)).toBe(prepared);
	const commit: HostReconciliationInput = { ...input, operation: "commit", receiptId: prepared.receipt.id };
	expect(await port.reconcileHostControl(commit)).toBe(committed);
	expect(calls).toEqual([
		{
			name: "langflowHost.reconcile",
			context: expect.objectContaining({ actor: { kind: "system", name: "trellis" }, session: null }),
			value: input,
		},
		{
			name: "langflowHost.reconcile",
			context: expect.objectContaining({ actor: { kind: "system", name: "trellis" }, session: null }),
			value: commit,
		},
	]);
});

test("blocked reconciliation returns unchanged without a commit call", async () => {
	const blocked: HostReconciliationResult = { state: "blocked", reason: "snapshot_unavailable" };
	let calls = 0;
	const port = reconciliationTransport({
		call: async () => {
			calls++;
			return blocked;
		},
	});
	expect(await port.reconcileHostControl(input)).toBe(blocked);
	expect(calls).toBe(1);
});

test("destination refusal and unknown commit errors propagate without another call", async () => {
	for (const message of ["host_reconciliation_destination_components_unverified", "worker_response_lost"]) {
		const failure = new Error(message);
		let calls = 0;
		const port = reconciliationTransport({
			call: async () => {
				calls++;
				throw failure;
			},
		});
		await expect(
			port.reconcileHostControl({ ...input, operation: "commit", receiptId: prepared.receipt.id }),
		).rejects.toBe(failure);
		expect(calls).toBe(1);
	}
});
