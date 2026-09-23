import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { openTestDb } from "../testDb.ts";
import { search } from "./search.ts";

const at = new Date("2026-09-21T12:00:00.000Z");
const opId = "01M00000000000000000000001";
const woId = "01M00000000000000000000002";
const opStatusId = "01M00000000000000000000003";
const woStatusId = "01M00000000000000000000004";

let db: Db;

const insertProject = (id: string, key: string, slug: string, name: string) =>
	db.execute(sql`
		INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${name}, ${at}, ${at})
	`);

const insertStatus = (id: string, projectId: string) =>
	db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${id}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
	`);

const insertTicket = (id: string, rootId: string, statusId: string, number: number, title: string) =>
	db.execute(sql`
		INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${id}, ${rootId}, ${number}, ${title}, ${statusId}, ${number}, ${at}, ${at})
	`);

beforeAll(async () => {
	db = await openTestDb();
	await insertProject(opId, "OP", "op", "Operator");
	await insertProject(woId, "WO", "hardware-shop", "Hardware Shop");
	await insertStatus(opStatusId, opId);
	await insertStatus(woStatusId, woId);
	await insertTicket("01M00000000000000000000005", opId, opStatusId, 1, "Service: The webhook settles the routine run");
	await insertTicket("01M00000000000000000000006", opId, opStatusId, 2, "Add button in attachments does nothing");
	await insertTicket("01M00000000000000000000007", woId, woStatusId, 1, "Store backend Stripe webhook edge function");
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a search does not match a fragment inside a longer typed word", async () => {
	const found = await db.transaction((tx) => search(tx, { q: "zzzqqqnothing" }));

	expect(found.tickets.map((ticket) => ticket.identifier)).toEqual([]);
});

test("a search matches a word prefix", async () => {
	const found = await db.transaction((tx) => search(tx, { q: "noth" }));

	expect(found.tickets.map((ticket) => ticket.identifier)).toEqual(["OP-2"]);
});

test("rankProject puts that project before other matching projects", async () => {
	const found = await db.transaction((tx) => search(tx, { q: "webhook", rankProjectIds: [opId] }));

	expect(found.tickets.map((ticket) => ticket.identifier).slice(0, 2)).toEqual(["OP-1", "WO-1"]);
});

test("a project search matches a word prefix but not a word fragment", async () => {
	const prefix = await db.transaction((tx) => search(tx, { q: "hard" }));
	const fragment = await db.transaction((tx) => search(tx, { q: "ware" }));

	expect(prefix.projects.map((project) => project.key)).toEqual(["WO"]);
	expect(fragment.projects.map((project) => project.key)).toEqual([]);
});
