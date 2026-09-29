import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { ids, receiptFixture } from "../../db/queries/langflowExecution/fixtures/fixture";
import { langflowExecutions } from "../../db/tables/langflowExecution";
import { protocolDigest } from "../../langflowContracts";
import type { AuthorityCommit, LiveOwnership } from "../contracts";
import { LangflowHostControl } from "../hostControl";
import { DispatchReceiptArchive } from "../receiptArchive";
import { createAuthorityPort } from "./authorityPort";

const roots: string[] = [];
const databases: Db[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-authority-port-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	LangflowHostControl.create({
		home,
		evidence: {
			async readTerminal() {
				throw new Error("terminal_unavailable");
			},
			async withReconciliation() {
				throw new Error("reconciliation_unavailable");
			},
		},
	});
	const control = LangflowHostControl.openEffects({
		home,
		async readTerminal() {
			throw new Error("terminal_unavailable");
		},
	});
	const archive = DispatchReceiptArchive.open(control);
	const stored = await receiptFixture();
	const db = stored.db;
	databases.push(db);
	const authority = { ...stored.authority, hostId: control.identity.hostId };
	await db
		.update(langflowExecutions)
		.set({ hostId: authority.hostId, authority })
		.where(eq(langflowExecutions.executionId, ids.execution));
	const observation: LiveOwnership = {
		id: "current-observation",
		identity: {
			dataHomeId: control.identity.dataHomeId,
			hostId: authority.hostId,
			ownerId: authority.ownerId,
			instanceId: crypto.randomUUID(),
			manifestDigest: "a".repeat(64),
		},
		observedAt: "2026-09-29T06:30:00.000Z",
		endpoint: "http://127.0.0.1:12345",
	};
	const request = {
		version: 1 as const,
		requestId: crypto.randomUUID(),
		executionId: authority.executionId,
		ownerId: authority.ownerId,
		engineEpoch: authority.engineEpoch,
		expectedRevision: authority.ownershipRevision,
		supervisorObservationId: observation.id,
	};
	const requestBytes = `${JSON.stringify(request, null, 2)}\n`;
	const next = {
		...authority,
		ownershipRevision: authority.ownershipRevision + 1,
		capabilityId: crypto.randomUUID(),
		issuedAt: observation.observedAt,
		expiresAt: "2026-09-29T08:00:00.000Z",
	};
	const commit: AuthorityCommit = {
		requestBytes,
		authorityBytes: `${JSON.stringify(next, null, 2)}\n`,
		receipt: {
			version: 1,
			request,
			requestDigest: protocolDigest(requestBytes),
			renewalId: crypto.randomUUID(),
			authority: next,
		},
		observation,
		revocation: null,
	};
	return { control, archive, db, commit };
}

test("the production adapter restores exact issued bytes after a lost commit response", async () => {
	const f = await fixture();
	let loseResponse = true;
	const port = createAuthorityPort({
		...f,
		async newTx(operation) {
			const result = await f.db.transaction(operation);
			if (loseResponse) {
				loseResponse = false;
				throw new Error("commit_response_lost");
			}
			return result;
		},
	});
	await expect(port.commit(f.commit)).rejects.toThrow("commit_response_lost");
	expect(() => f.archive.readAuthorityBytes(f.commit.receipt.authority)).toThrow();
	const reopened = createAuthorityPort({ ...f, newTx: (operation) => f.db.transaction(operation) });
	expect(await reopened.readReceipt(f.commit.receipt.request)).toEqual(f.commit);
	expect(f.archive.readAuthorityBytes(f.commit.receipt.authority)).toBe(f.commit.authorityBytes);
	expect(await reopened.commit(f.commit)).toEqual(f.commit.receipt);
	expect((await reopened.read(ids.execution)).authority).toEqual(f.commit.receipt.authority);
});

test("revocation survives reopening and rejects a grant from the retired owner", async () => {
	const f = await fixture();
	const port = createAuthorityPort({ ...f, newTx: (operation) => f.db.transaction(operation) });
	const identity = f.commit.observation.identity;
	const first = await port.revokeOwner({ identity, observationId: "first" });
	const reopened = createAuthorityPort({ ...f, newTx: (operation) => f.db.transaction(operation) });
	expect(await reopened.revokeOwner({ identity, observationId: "later" })).toEqual(first);
	expect(await reopened.readRevocation(identity)).toEqual(first);
	await expect(reopened.commit(f.commit)).rejects.toThrow();
	expect((await reopened.read(ids.execution)).authority.ownershipRevision).toBe(1);
	expect(() => f.archive.readAuthorityBytes(f.commit.receipt.authority)).toThrow();
});

test("a foreign home or observation cannot mutate the ownership record", async () => {
	const f = await fixture();
	const port = createAuthorityPort({ ...f, newTx: (operation) => f.db.transaction(operation) });
	await expect(
		port.commit({
			...f.commit,
			observation: {
				...f.commit.observation,
				identity: { ...f.commit.observation.identity, dataHomeId: "foreign" },
			},
		}),
	).rejects.toThrow("authority_control_home_mismatch");
	await expect(
		port.commit({ ...f.commit, observation: { ...f.commit.observation, id: "foreign" } }),
	).rejects.toThrow("authority_observation_mismatch");
	expect((await port.read(ids.execution)).authority.ownershipRevision).toBe(1);
});
