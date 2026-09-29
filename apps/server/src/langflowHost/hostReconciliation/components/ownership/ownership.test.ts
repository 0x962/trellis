import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { authorityControl } from "../../../../db/queries/langflowExecution/authorityControl/authorityControl";
import { ids, now, receiptFixture } from "../../../../db/queries/langflowExecution/fixtures/fixture";
import { langflowExecutions, langflowExecutionProjections, langflowOwnerFences } from "../../../../db/tables/langflowExecution";
import { protocolDigest } from "../../../../langflowContracts";
import { manifest } from "../../../fixtures/manifest";
import { LangflowHostControl } from "../../../hostControl";
import { DispatchReceiptArchive } from "../../../receiptArchive";
import type { HostReconciliationInput } from "../../contracts";
import { readActiveOwnership, verifyOwnership } from "./index";

const roots: string[] = [];
const databases: Awaited<ReturnType<typeof receiptFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "trellis-reconcile-owner-"));
	roots.push(root);
	const home = join(root, "home");
	await mkdir(home);
	const initialized = LangflowHostControl.initialize({
		home, initialBlock: { requestId: crypto.randomUUID(), reason: { kind: "initialize" } },
	});
	if (!initialized.block) throw new Error("fixture_block_missing");
	const control = LangflowHostControl.openEffects({
		home, readTerminal: async () => { throw new Error("fixture_terminal_unavailable"); },
	});
	const archive = DispatchReceiptArchive.open(control);
	const stored = await receiptFixture();
	const db = stored.db;
	databases.push(db);
	const identity = {
		dataHomeId: control.identity.dataHomeId, hostId: control.identity.hostId,
		ownerId: crypto.randomUUID(), instanceId: crypto.randomUUID(), manifestDigest: "a".repeat(64),
	};
	const authority = { ...stored.authority, hostId: identity.hostId, ownerId: identity.ownerId };
	await db.update(langflowExecutions).set({ hostId: identity.hostId, authority })
		.where(eq(langflowExecutions.executionId, ids.execution));
	await db.update(langflowExecutionProjections).set({ view: { ...stored.view, status: "running" } });
	await db.insert(langflowOwnerFences).values({ id: crypto.randomUUID(), ownerKey: [identity.hostId, identity.ownerId] });
	const authorityBytes = ` ${JSON.stringify(authority)}\n`;
	archive.writeAuthority({ authorityBytes, issuanceReceiptId: "fixture-issuance" });
	const input: HostReconciliationInput = {
		operation: "prepare", block: initialized.block, bootId: crypto.randomUUID(), manifest,
		enginePackageDigest: "a".repeat(64), engineConfigSha256: "b".repeat(64),
		observation: { id: "observation", identity, observedAt: now.toISOString(), endpoint: "http://127.0.0.1:7860" },
		openedDatabaseReceiptId: null, receiptId: null,
	};
	const before = await db.transaction(readActiveOwnership);
	const sourceBytes = JSON.stringify({ authorityBytes, authority });
	const engine = [{ authorityBytes, authorityDigest: protocolDigest(authorityBytes), authority, revokedAt: null, sourceBytes, sourceDigest: protocolDigest(sourceBytes) }];
	return { db, input, before, engine, archive, control };
}

test("ownership proof reads the current fence and exact archived grant bytes", async () => {
	const f = await fixture();
	const proof = await f.db.transaction((tx) => verifyOwnership(tx, f.input, f.before, f.engine, f.archive, now));
	expect(proof.sourceDigest).toBe(protocolDigest(proof.sourceBytes));
	expect(JSON.parse(proof.sourceBytes).engine[0].authorityBytes).toBe(f.engine[0]!.authorityBytes);
	expect(f.control.gate.read().block).toEqual(f.input.block);
});

test("a durable owner revocation refuses proof", async () => {
	const f = await fixture();
	await f.db.transaction((tx) => authorityControl.revokeOwner(tx, {
		identity: f.input.observation.identity, observationId: "retired",
	}));
	await expect(f.db.transaction((tx) => verifyOwnership(tx, f.input, f.before, f.engine, f.archive, now)))
		.rejects.toThrow("host_reconciliation_owner_revoked");
});

test("an expired grant and a changed execution refuse proof", async () => {
	const f = await fixture();
	await expect(f.db.transaction((tx) => verifyOwnership(tx, f.input, f.before, f.engine, f.archive, new Date("2026-09-30T00:00:00Z"))))
		.rejects.toThrow("host_reconciliation_authority_unavailable");
	await f.db.update(langflowExecutions).set({ revision: 2 }).where(eq(langflowExecutions.executionId, ids.execution));
	await expect(f.db.transaction((tx) => verifyOwnership(tx, f.input, f.before, f.engine, f.archive, now)))
		.rejects.toThrow("host_reconciliation_ownership_changed");
});

test("missing owner fences are valid only for empty initialization", async () => {
	const f = await fixture();
	await f.db.delete(langflowExecutionProjections);
	await f.db.delete(langflowExecutions);
	f.input.observation.identity.ownerId = crypto.randomUUID();
	const before = await f.db.transaction(readActiveOwnership);
	const proof = await f.db.transaction((tx) => verifyOwnership(tx, f.input, before, [], f.archive, now));
	expect(JSON.parse(proof.sourceBytes).fence).toBeNull();
	f.input.block.reason = { kind: "capture", snapshotId: crypto.randomUUID() };
	await expect(f.db.transaction((tx) => verifyOwnership(tx, f.input, before, [], f.archive, now)))
		.rejects.toThrow("host_reconciliation_owner_revoked");
});
