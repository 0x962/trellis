import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../langflowContracts";
import authorityFixture from "../../langflowContracts/fixtures/authority.json";
import type { DispatchBlock, DispatchEvidence, EffectBinding } from "../dispatchGate";
import { LangflowHostControl } from "../hostControl";
import { DispatchReceiptArchive } from "./receiptArchive";
import type { ReconciliationSources } from "./schema";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const source = (value: unknown) => {
	const sourceBytes = JSON.stringify(value);
	return { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
};
const sources = (block: DispatchBlock): ReconciliationSources => ({
	trellisDatabase: source({ database: "trellis" }),
	engineDatabase: source({ database: "engine" }),
	secret: source({ digest: "a".repeat(64) }),
	ownership: source({ owner: "owner" }),
	nativeAttempts: source({ ready: true, unavailable: [], files: [] }),
	stopObligations: source({
		version: 1,
		dataHomeId: block.dataHomeId,
		blockId: block.id,
		generation: block.generation,
		records: [{ stops: [] }],
	}),
	snapshotSeal: null,
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-receipt-test-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	let archive: DispatchReceiptArchive;
	const evidence: DispatchEvidence = {
		readTerminal: (permit, id) => archive.readTerminal(permit, id),
		async withReconciliation(block, id, commit) {
			commit(archive.readReconciliation(block, id));
		},
	};
	const control = LangflowHostControl.create({ home, evidence });
	archive = DispatchReceiptArchive.open(control);
	const block = control.gate.read().block;
	if (!block) throw new Error("missing_block");
	return { home, evidence, control, archive, block };
}
const binding: EffectBinding = {
	effectId: "cancel",
	kind: "cancellation",
	executionId: "e",
	attemptId: null,
	jobId: "j",
	requestId: "request",
	payloadDigest: "b".repeat(64),
};

test("terminal evidence retains exact bytes and permit across restart", async () => {
	const f = fixture();
	const released = f.archive.writeReconciliation({
		block: f.block,
		packageDigest: "a".repeat(64),
		sources: sources(f.block),
	});
	await f.control.gate.reconcile(f.block, released.id);
	const permit = f.control.gate.acquire(binding);
	const proof = source({ requestId: binding.requestId, payloadDigest: binding.payloadDigest, revision: 8 });
	const receipt = f.archive.writeTerminal({ permit, outcome: "completed", ...proof });
	let reopened: DispatchReceiptArchive;
	const effects = LangflowHostControl.openEffects({
		home: f.home,
		readTerminal: (saved, id) => reopened.readTerminal(saved, id),
	});
	reopened = DispatchReceiptArchive.open(effects);
	expect(await reopened.readTerminal(permit, receipt.id)).toEqual(receipt);
	expect(JSON.parse(reopened.readRecordBytes(receipt.id)).source).toEqual(proof);
	expect(reopened.writeTerminal({ permit, outcome: "completed", ...proof }).id).toBe(receipt.id);
	await effects.gate.settle(permit, receipt.id);
	expect(f.control.gate.recoverPermit(binding)?.terminal).toEqual(receipt);
	expect(() =>
		reopened.writeTerminal({ permit, outcome: "completed", ...proof, sourceDigest: "c".repeat(64) }),
	).toThrow("receipt_source_digest_mismatch");
	writeFileSync(join(LangflowHostControl.directory(f.home), "receipts", `${receipt.id}.json`), "{}");
	await expect(reopened.readTerminal(permit, receipt.id)).rejects.toThrow("receipt_digest_mismatch");
});

test("reconciliation refuses unresolved stops and incomplete native files", () => {
	const f = fixture();
	const proof = sources(f.block);
	proof.stopObligations = source({
		version: 1,
		dataHomeId: f.block.dataHomeId,
		blockId: f.block.id,
		generation: f.block.generation,
		records: [{ stops: [{ state: "pending" }] }],
	});
	expect(() =>
		f.archive.writeReconciliation({ block: f.block, packageDigest: "a".repeat(64), sources: proof }),
	).toThrow("receipt_stops_unconfirmed");
	proof.stopObligations = sources(f.block).stopObligations;
	proof.nativeAttempts = source({ ready: false, unavailable: ["attempt"], files: [] });
	expect(() =>
		f.archive.writeReconciliation({ block: f.block, packageDigest: "a".repeat(64), sources: proof }),
	).toThrow();
	expect(f.control.gate.read().block).toEqual(f.block);
});

test("reconciliation rejects another block generation and preserves the original source bytes", () => {
	const f = fixture();
	const proof = sources({ ...f.block, generation: f.block.generation + 1 });
	expect(() =>
		f.archive.writeReconciliation({ block: f.block, packageDigest: "a".repeat(64), sources: proof }),
	).toThrow("receipt_stop_scope_mismatch");
	const good = sources(f.block);
	const receipt = f.archive.writeReconciliation({ block: f.block, packageDigest: "a".repeat(64), sources: good });
	expect(JSON.parse(f.archive.readRecordBytes(receipt.id)).sources.stopObligations.sourceBytes).toBe(
		good.stopObligations.sourceBytes,
	);
	expect(f.archive.readReconciliation(f.block, receipt.id)).toEqual(receipt);
});

test("authority archive preserves original grant whitespace and refuses another host", () => {
	const f = fixture();
	const authorityBytes = `${JSON.stringify({ ...authorityFixture, hostId: f.control.identity.hostId }, null, 2)}\n`;
	const receipt = f.archive.writeAuthority({ authorityBytes, issuanceReceiptId: "issued" });
	const reopened = DispatchReceiptArchive.open(LangflowHostControl.open({ home: f.home, evidence: f.evidence }));
	expect(reopened.readAuthority(receipt.id).authorityBytes).toBe(authorityBytes);
	expect(reopened.readAuthority(receipt.id).authorityDigest).toBe(protocolDigest(authorityBytes));
	expect(() =>
		reopened.writeAuthority({
			authorityBytes: JSON.stringify(JSON.parse(authorityBytes)),
			issuanceReceiptId: "issued",
		}),
	).toThrow("receipt_immutable_conflict");
	expect(() =>
		f.archive.writeAuthority({ authorityBytes: JSON.stringify(authorityFixture), issuanceReceiptId: "wrong-home" }),
	).toThrow("receipt_authority_home_mismatch");
});
