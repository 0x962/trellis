import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { ulid } from "ulid";
import { type Db, openDb } from "../client.ts";
import { reviewLocalFacts } from "../queries/reviewLocalFacts/index.ts";
import { advance, historyDirectory, insertPr, retainedRows } from "./history.ts";
import { cases, seed } from "./seed.ts";

let db: Db;
let directory: string;
afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

test("0143 preserves historical readiness and approvals and changes only the insert default", async () => {
	directory = await historyDirectory();
	db = await openDb(":memory:");
	await advance(db, directory, 98);
	const oldDefault = ulid();
	await insertPr(db, oldDefault, 1);
	await advance(db, directory, 105);
	const oldExplicit = ulid();
	await insertPr(db, oldExplicit, 3);
	await db.$client.query("UPDATE pull_requests SET local_state='draft' WHERE id=$1", [oldExplicit]);
	await db.$client.query("UPDATE pull_requests SET local_state='ready' WHERE id=$1", [oldExplicit]);
	await advance(db, directory, 142);
	const { ids, mark, push } = await seed(
		db,
		new Map([
			["before-0099", oldDefault],
			["before-0106", oldExplicit],
		]),
	);
	const before = await retainedRows(db);
	const urls = cases.map((_, index) => `https://github.com/upgrade/review/pull/${index + 1}`);
	const facts = await db.transaction((tx) => reviewLocalFacts(tx, { urls }));
	const count = async () => (await db.$client.query("SELECT * FROM drizzle.__drizzle_migrations")).rows.length;
	const countBefore = await count();
	await advance(db, directory, 143);
	expect(await count()).toBe(countBefore + 1);
	expect(await retainedRows(db)).toEqual(before);
	expect(await db.transaction((tx) => reviewLocalFacts(tx, { urls }))).toEqual(facts);
	for (const [index, name] of cases.entries()) {
		const result = facts.get(urls[index]!)!;
		expect(result.localState, name).toBe(name.startsWith("withdrawn") ? "not-ready" : "ready");
		expect(result.localVerdict, name).toBe(name.endsWith("approved") ? "approved" : null);
	}
	const inserted = ulid();
	await insertPr(db, inserted, 15);
	expect((await db.$client.query("SELECT local_state FROM pull_requests WHERE id=$1", [inserted])).rows).toEqual([
		{ local_state: "not-ready" },
	]);
	await mark("implicit-approved", "not-ready");
	const approvedUrl = urls[cases.indexOf("implicit-approved")]!;
	expect((await db.transaction((tx) => reviewLocalFacts(tx, { urls: [approvedUrl] }))).get(approvedUrl)).toEqual({
		localState: "not-ready",
		localVerdict: "approved",
	});
	await mark("implicit-approved", "ready");
	await push("implicit-approved");
	expect((await db.transaction((tx) => reviewLocalFacts(tx, { urls: [approvedUrl] }))).get(approvedUrl)).toEqual({
		localState: "ready",
		localVerdict: "approved",
	});
	expect(
		(
			await db.$client.query("SELECT ready_for_review_at FROM pull_requests WHERE id=$1", [
				ids.get("implicit-approved")!,
			])
		).rows,
	).toEqual([{ ready_for_review_at: null }]);
	const saved = await retainedRows(db);
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	await advance(db, directory, 143);
	expect(await count()).toBe(countBefore + 1);
	expect(await retainedRows(db)).toEqual(saved);
}, 120_000);
