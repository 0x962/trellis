import { afterEach, expect, test } from "bun:test";
import type { Db } from "../../../client";
import { authorityControl } from "../authorityControl";
import { readExecution } from "../executions";
import { ids, now } from "../fixtures/fixture";
import { cancelExecution } from "../stops";
import { renewalFixture } from "./fixtures/renewalFixture";
import { recoverInitialBinding } from "./recoverInitialBinding";

let db: Db;
afterEach(async () => db.$client.close());
const execution = { executionId: ids.execution };

test("binds a same-owner renewal atomically and returns original replay bytes", async () => {
	const fixture = await renewalFixture();
	db = fixture.db;
	const before = await db.transaction((tx) => readExecution(tx, execution));
	await expect(db.transaction(async (tx) => {
		await recoverInitialBinding(tx, fixture.input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
	const saved = await db.transaction((tx) => recoverInitialBinding(tx, fixture.input));
	expect(saved.initialRecordBytes).toBe(fixture.input.initialRecordBytes);
	expect(await db.transaction((tx) => recoverInitialBinding(tx, fixture.input))).toEqual(saved);
	const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(after.authority).toEqual(fixture.input.takeover.receipt.authority);
	expect(after.admission).toEqual(before!.admission);
	expect(after.submission.admission).toEqual(before!.submission.admission);
}, 60000);

test("refuses a revoked owner and a changed supervisor identity", async () => {
	const fixture = await renewalFixture();
	db = fixture.db;
	await expect(db.transaction((tx) => recoverInitialBinding(tx, {
		...fixture.input, takeover: { ...fixture.input.takeover, observation: {
			...fixture.input.takeover.observation, identity: { ...fixture.initial.observation.identity, instanceId: "other" },
		} },
	}))).rejects.toThrow("initial_recovery_identity_conflict");
	await db.transaction((tx) => authorityControl.revokeOwner(tx, {
		identity: fixture.initial.observation.identity, observationId: "retire",
	}));
	await expect(db.transaction((tx) => recoverInitialBinding(tx, fixture.input))).rejects.toThrow("owner_revoked");
	expect((await db.transaction((tx) => readExecution(tx, execution)))!.authority).toBeNull();
}, 60000);

test("narrows cancellation renewal without an admission or scheduling effect", async () => {
	const fixture = await renewalFixture();
	db = fixture.db;
	await db.transaction((tx) => cancelExecution(tx, {
		intent: { version: 1, ...execution, requestId: crypto.randomUUID(), expectedRevision: 1,
			actor: { kind: "human", name: "fixture" }, requestedAt: now.toISOString() }, obligations: [],
	}));
	await expect(db.transaction((tx) => recoverInitialBinding(tx, fixture.input)))
		.rejects.toThrow("cancellation_requires_successor_authority");
	const authority = { ...fixture.input.takeover.receipt.authority, permissions: ["execution.cancel"] as const };
	const takeover = { ...fixture.input.takeover, authorityBytes: JSON.stringify(authority),
		receipt: { ...fixture.input.takeover.receipt, authority: { ...authority, permissions: [...authority.permissions] } } };
	const before = (await db.transaction((tx) => readExecution(tx, execution)))!;
	await db.transaction((tx) => recoverInitialBinding(tx, { ...fixture.input, takeover }));
	const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(after.cancelIntent).toEqual(before.cancelIntent);
	expect(after.admission).toEqual(before.admission);
	expect(after.submission.admission).toEqual(before.submission.admission);
}, 60000);
