import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../../../client";
import { authorityControl } from "../authorityControl";
import { assertAuthority, lockExecution, readExecution } from "../executions";
import { ids, now } from "../fixtures/fixture";
import { cancelExecution } from "../stops";
import { recoveryFixture } from "./fixtures/recoveryFixture";
import { recoverInitialBinding } from "./recoverInitialBinding";

let db: Db;
afterEach(async () => db.$client.close());
const execution = { executionId: ids.execution };

test("recovers only the successor and preserves original issuance bytes through reopen", async () => {
	const fixture = await recoveryFixture();
	db = fixture.db;
	const before = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(before.authority).toBeNull();
	const saved = await db.transaction((tx) => recoverInitialBinding(tx, fixture.input));
	expect(saved.initialRecordBytes).toBe(fixture.input.initialRecordBytes);
	expect(saved.authorityBytes).toBe(fixture.input.takeover.authorityBytes);
	const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(after.authority).toEqual(fixture.input.takeover.receipt.authority);
	expect(after.correlation).toEqual(fixture.initial.input.correlation);
	expect(after.admission).toEqual(before.admission);
	expect(after.submission.admission).toEqual(before.submission.admission);
	expect((await db.execute(sql`SELECT count(*)::int AS n FROM langflow_outbox`)).rows).toEqual([{ n: 0 }]);
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => authorityControl.readReceipt(tx, saved.receipt.request))).toEqual(saved);
	expect(await db.transaction((tx) => recoverInitialBinding(tx, fixture.input))).toEqual(saved);
}, 60000);

test("rolls back the historical binding and refuses changed issuance replay", async () => {
	const fixture = await recoveryFixture();
	db = fixture.db;
	const before = await db.transaction((tx) => readExecution(tx, execution));
	await expect(db.transaction(async (tx) => {
		await recoverInitialBinding(tx, fixture.input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
	expect(await db.transaction((tx) => authorityControl.readReceipt(tx, fixture.input.takeover.receipt.request))).toBeNull();
	await db.transaction((tx) => recoverInitialBinding(tx, fixture.input));
	await expect(db.transaction((tx) => recoverInitialBinding(tx, {
		...fixture.input, initialRecordBytes: `${fixture.input.initialRecordBytes} `,
	}))).rejects.toThrow("identity_conflict");
}, 60000);

test("refuses changed correlation, revoked successors, and invented prior revocations", async () => {
	const fixture = await recoveryFixture();
	db = fixture.db;
	const changed = structuredClone(fixture.initial);
	changed.input.correlation.engineJobId = "00000000-0000-4000-8000-000000000009";
	await expect(db.transaction((tx) => recoverInitialBinding(tx, {
		...fixture.input, initialRecordBytes: JSON.stringify(changed),
	}))).rejects.toThrow("initial_recovery_identity_conflict");
	await expect(db.transaction((tx) => recoverInitialBinding(tx, {
		...fixture.input,
		takeover: { ...fixture.input.takeover, revocation: { ...fixture.input.takeover.revocation!, observationId: "fake" } },
	}))).rejects.toThrow("owner_revocation_conflict");
	await db.transaction((tx) => authorityControl.revokeOwner(tx, {
		identity: fixture.input.takeover.observation.identity, observationId: "retire-2",
	}));
	await expect(db.transaction((tx) => recoverInitialBinding(tx, fixture.input))).rejects.toThrow("owner_revoked");
	expect((await db.transaction((tx) => readExecution(tx, execution)))!.authority).toBeNull();
}, 60000);

test("preserves cancellation and permits only a cancellation grant", async () => {
	const fixture = await recoveryFixture();
	db = fixture.db;
	await db.transaction((tx) => cancelExecution(tx, {
		intent: {
			version: 1, ...execution, requestId: crypto.randomUUID(), expectedRevision: 1,
			actor: { kind: "human", name: "fixture" }, requestedAt: now.toISOString(),
		},
		obligations: [],
	}));
	const before = (await db.transaction((tx) => readExecution(tx, execution)))!;
	const outbox = (await db.execute(sql`SELECT * FROM langflow_outbox`)).rows;
	await expect(db.transaction((tx) => recoverInitialBinding(tx, fixture.input)))
		.rejects.toThrow("cancellation_requires_successor_authority");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
	const authority = { ...fixture.input.takeover.receipt.authority, permissions: ["execution.cancel"] as const };
	const takeover = {
		...fixture.input.takeover,
		authorityBytes: JSON.stringify(authority),
		receipt: { ...fixture.input.takeover.receipt, authority: { ...authority, permissions: [...authority.permissions] } },
	};
	await db.transaction((tx) => recoverInitialBinding(tx, { ...fixture.input, takeover }));
	const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(after.cancelIntent).toEqual(before.cancelIntent);
	expect(after.admission).toEqual(before.admission);
	expect(after.submission.admission).toEqual(before.submission.admission);
	expect((await db.execute(sql`SELECT * FROM langflow_outbox`)).rows).toEqual(outbox);
	await db.transaction(async (tx) => {
		const row = await lockExecution(tx, execution);
		await assertAuthority(tx, row, takeover.receipt.authority, "execution.cancel", now);
	});
}, 60000);

test("cannot replace an execution that already has an initial binding", async () => {
	const fixture = await recoveryFixture(true);
	db = fixture.db;
	const before = await db.transaction((tx) => readExecution(tx, execution));
	await expect(db.transaction((tx) => recoverInitialBinding(tx, fixture.input)))
		.rejects.toThrow("initial_recovery_binding_conflict");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
}, 60000);
