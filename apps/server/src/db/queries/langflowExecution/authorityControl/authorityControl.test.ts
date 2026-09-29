import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../../langflowContracts";
import type { AuthorityCommit, SidecarIdentity } from "../../../../langflowHost/contracts";
import { type Db, openDb } from "../../../client";
import { migrate } from "../../../migrate";
import { assertAuthority, lockExecution, openAdmission, readExecution } from "../executions";
import { admission, ids, jobId, now, receiptFixture, submissionBytes } from "../fixtures/fixture";
import { beforeDocuments } from "../fixtures/migration";
import { transferOwnership } from "../ownership";
import { cancelExecution } from "../stops";
import { bindExecution } from "../submission";
import { authorityControl } from "./authorityControl";

let db: Db;
afterEach(async () => db.$client.close());
const execution = { executionId: ids.execution };
const identity: SidecarIdentity = {
	dataHomeId: "home-1", hostId: "host-1", ownerId: "owner-1", instanceId: "instance-1", manifestDigest: "a".repeat(64),
};
async function fixture(open = true) {
	db = await beforeDocuments(140);
	await migrate(db);
	return receiptFixture(open, db);
}
async function renewal(): Promise<AuthorityCommit> {
	const row = await db.transaction((tx) => authorityControl.read(tx, execution));
	const request = {
		version: 1 as const, ...execution, requestId: crypto.randomUUID(), ownerId: row.authority.ownerId,
		engineEpoch: row.authority.engineEpoch, expectedRevision: row.authority.ownershipRevision,
		supervisorObservationId: "observation-2",
	};
	const requestBytes = ` ${JSON.stringify(request)}\r\n`;
	const authority = { ...row.authority, ownershipRevision: row.authority.ownershipRevision + 1,
		capabilityId: "capability-2", issuedAt: now.toISOString(),
	};
	return {
		requestBytes, authorityBytes: ` ${JSON.stringify(authority)}\r\n`,
		receipt: { version: 1, request, requestDigest: protocolDigest(requestBytes), renewalId: "renewal-2", authority },
		observation: { id: request.supervisorObservationId, identity, observedAt: now.toISOString(), endpoint: "http://127.0.0.1:4000" },
		revocation: null,
	};
}
test("commits exact grant bytes with ownership and repairs reads after archive reopen", async () => {
	await fixture();
	const input = await renewal();
	const before = await db.transaction((tx) => readExecution(tx, execution));
	await expect(db.transaction(async (tx) => {
		await authorityControl.commit(tx, input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
	expect(await db.transaction((tx) => authorityControl.readReceipt(tx, input.receipt.request))).toBeNull();
	expect(await db.transaction((tx) => authorityControl.commit(tx, input))).toEqual(input);
	expect(await db.transaction((tx) => authorityControl.commit(tx, input))).toEqual(input);
	await expect(db.transaction((tx) => authorityControl.commit(tx, {
		...input, authorityBytes: JSON.stringify(input.receipt.authority),
	}))).rejects.toThrow("identity_conflict");
	await expect(db.transaction((tx) => authorityControl.commit(tx, {
		...input, authorityBytes: JSON.stringify({ ...input.receipt.authority, ownerId: "other" }),
	}))).rejects.toThrow("authority_commit_conflict");
	await expect(db.execute(sql`UPDATE langflow_authority_commits SET commit='{}'::jsonb`))
		.rejects.toThrow("Authority commits are immutable");
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => authorityControl.readReceipt(tx, input.receipt.request))).toEqual(input);
}, 60000);
test("revocation retains its first identity and fences grant use, commit, and replay", async () => {
	await fixture();
	const input = await renewal();
	await db.transaction((tx) => authorityControl.commit(tx, input));
	await expect(db.transaction(async (tx) => {
		await authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" });
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => authorityControl.readRevocation(tx, identity))).toBeNull();
	const revoked = await db.transaction((tx) => authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" }));
	expect(await db.transaction((tx) => authorityControl.revokeOwner(tx, { identity, observationId: "retire-2" }))).toEqual(revoked);
	await expect(db.transaction((tx) => authorityControl.revokeOwner(tx, {
		identity: { ...identity, instanceId: "other" }, observationId: "retire-1",
	}))).rejects.toThrow("owner_identity_conflict");
	await expect(db.transaction((tx) => authorityControl.commit(tx, input))).rejects.toThrow("owner_revoked");
	await expect(db.transaction((tx) => authorityControl.readReceipt(tx, input.receipt.request))).rejects.toThrow("owner_revoked");
	await expect(db.transaction(async (tx) => {
		const row = (await readExecution(tx, execution))!;
		await assertAuthority(tx, row, input.receipt.authority, "native.reserve", now);
	})).rejects.toThrow("owner_revoked");
	await expect(db.execute(sql`UPDATE langflow_owner_fences SET revocation=NULL`))
		.rejects.toThrow("Owner revocations are immutable");
}, 60000);
test("takeover requires the persisted revocation and preserves canceled admission", async () => {
	const original = await fixture();
	const prior = await db.transaction((tx) => authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" }));
	await db.transaction((tx) => cancelExecution(tx, {
		intent: { version: 1, ...execution, requestId: crypto.randomUUID(), expectedRevision: 2,
			actor: { kind: "human", name: "fixture" }, requestedAt: now.toISOString() }, obligations: [],
	}));
	const row = await db.transaction((tx) => authorityControl.read(tx, execution));
	const request = {
		version: 1 as const, ...execution, requestId: crypto.randomUUID(), expectedOwnerId: identity.ownerId,
		expectedEpoch: 1, expectedRevision: 1, newOwnerId: "owner-2", supervisorObservationId: "observation-2",
		priorOwnerRevocationId: prior.id,
	};
	const requestBytes = JSON.stringify(request);
	const authority = { ...original.authority, ownerId: "owner-2", engineEpoch: 2, ownershipRevision: 2,
		capabilityId: "capability-2", permissions: ["execution.cancel"] as typeof original.authority.permissions,
		issuedAt: now.toISOString() };
	const input: AuthorityCommit = {
		requestBytes, authorityBytes: ` ${JSON.stringify(authority)}\n`,
		receipt: { version: 1, request, requestDigest: protocolDigest(requestBytes), authority,
			transferId: "transfer-1", committedAt: now.toISOString(), admission: row.admission },
		observation: { id: request.supervisorObservationId, identity: { ...identity, ownerId: "owner-2", instanceId: "instance-2" },
			observedAt: now.toISOString(), endpoint: "http://127.0.0.1:4001" }, revocation: prior,
	};
	await expect(db.transaction((tx) => authorityControl.commit(tx, {
		...input, revocation: { ...prior, observationId: "invented" },
	}))).rejects.toThrow("owner_revocation_conflict");
	expect(await db.transaction((tx) => authorityControl.commit(tx, input))).toEqual(input);
	expect(await db.transaction((tx) => authorityControl.readReceipt(tx, request))).toEqual(input);
	expect((await db.transaction((tx) => authorityControl.read(tx, execution))).admission).toEqual(row.admission);
	expect((await db.execute(sql`SELECT count(*)::int AS n FROM langflow_outbox WHERE kind='admission'`)).rows)
		.toEqual([{ n: 1 }]);
}, 60000);
test("historical receipt bytes cannot be reconstructed from a later commit", async () => {
	await fixture();
	const input = await renewal();
	await db.transaction((tx) => transferOwnership(tx, input));
	await expect(db.transaction((tx) => authorityControl.readReceipt(tx, input.receipt.request)))
		.rejects.toThrow("authority_bytes_unavailable");
	await expect(db.transaction((tx) => authorityControl.commit(tx, input)))
		.rejects.toThrow("authority_bytes_unavailable");
}, 60000);


test("revocation prevents initial binding and admission", async () => {
	const initial = await fixture(false);
	const correlation = {
		version: 1 as const,
		...execution,
		hostId: identity.hostId,
		publicationId: ids.publication,
		submissionDigest: protocolDigest(submissionBytes),
		engineJobId: jobId,
		engineSessionId: "engine-session-1",
		recordedAt: now.toISOString(),
	};
	await db.transaction((tx) => authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" }));
	await expect(db.transaction((tx) => bindExecution(tx, {
		...execution, correlation, authority: initial.authority,
	}))).rejects.toThrow("owner_revoked");
	await expect(db.transaction((tx) => openAdmission(tx, {
		...execution, correlation, authority: initial.authority, receipt: admission,
	}))).rejects.toThrow("owner_revoked");
	expect((await db.transaction((tx) => readExecution(tx, execution)))!.authority).toBeNull();
}, 60000);

test("revocation waits for an authorized transaction and fences its next use", async () => {
	const initial = await fixture();
	const held = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const use = db.transaction(async (tx) => {
		const row = await lockExecution(tx, execution);
		await assertAuthority(tx, row, initial.authority, "native.reserve", now);
		held.resolve();
		await release.promise;
	});
	await held.promise;
	const revoke = db.transaction((tx) => authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" }));
	release.resolve();
	await Promise.all([use, revoke]);
	await expect(db.transaction(async (tx) => {
		const row = await lockExecution(tx, execution);
		await assertAuthority(tx, row, initial.authority, "native.reserve", now);
	})).rejects.toThrow("owner_revoked");
}, 60000);
