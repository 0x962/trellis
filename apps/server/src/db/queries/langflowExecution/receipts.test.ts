import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../../client";
import { classificationStore } from "./classification";
import { readExecution, reserveExecution } from "./executions";
import { ids, receiptFixture } from "./fixtures/fixture";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("retains actor request replay and rejects changed bytes", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const repeated = await db.transaction((tx) => reserveExecution(tx, fixture.input));
	expect(repeated.executionId).toBe(ids.execution);
	await expect(
		db.transaction((tx) => reserveExecution(tx, { ...fixture.input, requestBytes: "changed" })),
	).rejects.toThrow();
	expect((await db.transaction((tx) => readExecution(tx, { executionId: ids.execution })))!.admission.state).toBe(
		"open",
	);
});
test("rolls back a classification claim with its caller", async () => {
	({ db } = await receiptFixture());
	const input = {
		binding: {
			executionId: ids.execution,
			publicationId: ids.publication,
			diffId: ids.diff,
			reviewedHead: "a".repeat(40),
		},
		ownerToken: "owner",
		requestBytes: "settings",
	};
	await expect(
		db.transaction(async (tx) => {
			await classificationStore.claim(tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction((tx) => classificationStore.read(tx, { executionId: ids.execution }))).toBeNull();
	const first = await db.transaction((tx) => classificationStore.claim(tx, input));
	expect(first.acquired).toBe(true);
	const duplicate = await db.transaction((tx) => classificationStore.claim(tx, { ...input, ownerToken: "another" }));
	expect(duplicate).toEqual({ receipt: first.receipt, acquired: false });
	await expect(
		db.transaction((tx) => classificationStore.claim(tx, { ...input, requestBytes: "changed" })),
	).rejects.toThrow("classification_conflict");
	const failed = await db.transaction((tx) =>
		classificationStore.interrupt(tx, { executionId: ids.execution, ownerToken: "owner", error: "Owner exited." }),
	);
	expect(
		await db.transaction((tx) =>
			classificationStore.finish(tx, {
				receiptId: first.receipt.receiptId,
				ownerToken: "owner",
				result: { state: "succeeded", relevance: { frontend: true, backend: true } },
			}),
		),
	).toEqual(failed);
});
test("retains pending classification and execution after database restart", async () => {
	({ db } = await receiptFixture());
	const claim = await db.transaction((tx) =>
		classificationStore.claim(tx, {
			binding: {
				executionId: ids.execution,
				publicationId: ids.publication,
				diffId: ids.diff,
				reviewedHead: "a".repeat(40),
			},
			ownerToken: "owner",
			requestBytes: "settings",
		}),
	);
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => classificationStore.read(tx, { executionId: ids.execution }))).toEqual(
		claim.receipt,
	);
	expect((await db.transaction((tx) => readExecution(tx, { executionId: ids.execution })))!.engineJobId).not.toBeNull();
});
test("flow and diff deletion preserve history and ticket deletion cascades", async () => {
	({ db } = await receiptFixture());
	const original = await db.transaction((tx) => readExecution(tx, { executionId: ids.execution }));
	await db.execute(sql`DELETE FROM flows WHERE id=${ids.flow}`);
	await db.execute(sql`DELETE FROM pull_requests WHERE id=${ids.diff}`);
	const retained = await db.transaction((tx) => readExecution(tx, { executionId: ids.execution }));
	expect(retained!.publicationRecordId).toBeNull();
	expect(retained!.diffId).toBeNull();
	expect(retained!.publication).toEqual(original!.publication);
	expect(retained!.snapshot).toEqual(original!.snapshot);
	await db.execute(sql`DELETE FROM tickets WHERE id=${ids.ticket}`);
	expect(await db.transaction((tx) => readExecution(tx, { executionId: ids.execution }))).toBeNull();
	expect((await db.execute(sql`SELECT count(*)::int AS n FROM langflow_execution_projections`)).rows[0]!.n).toBe(0);
});
