import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context";
import * as epics from "../../services/epics/epics";
import { create as createTicket } from "../../services/tickets/create";
import * as waves from "../../services/waves/waves";
import { createCache } from "../cache";
import { type Db, openDb } from "../client";
import { migrate } from "../migrate";
import { projects, statuses } from "../schema";

let db: Db;
let directory: string;

afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

test("existing epic and wave rows retain relationships through migration and complete name edits", async () => {
	const migrations = join(import.meta.dir, "../../../drizzle");
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const target = journal.entries.find((entry) => entry.tag.endsWith("_complete_epic_wave_names"))!;
	const entries = journal.entries.filter((entry) => entry.idx < target.idx);
	directory = await mkdtemp(join(tmpdir(), "trellis-epic-wave-names-"));
	await mkdir(join(directory, "meta"));
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	const projectId = ulid();
	const now = new Date("2026-09-29T10:00:00Z");
	await db
		.insert(projects)
		.values({ id: projectId, key: "TST", slug: "tst", name: "Test", createdAt: now, updatedAt: now });
	await db.insert(statuses).values({
		id: ulid(),
		projectId,
		name: "Todo",
		slug: "todo",
		category: "todo",
		color: "fg-muted",
		position: 0,
		isDefault: true,
		createdAt: now,
		updatedAt: now,
	});
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	const epic = await db.transaction((tx) =>
		epics.create(ctx, tx, { project: "TST", name: "Plan", description: "Retain the plan." }),
	);
	const wave = await db.transaction((tx) => waves.create(ctx, tx, { epic: epic.id, name: "First" }));
	const ticket = await db.transaction((tx) =>
		createTicket(ctx, tx, { project: "TST", title: "Retain the links", wave: wave.id }),
	);
	const epicBefore = (await db.execute(sql`SELECT * FROM epics WHERE id = ${epic.id}`)).rows;
	const waveBefore = (await db.execute(sql`SELECT * FROM waves WHERE id = ${wave.id}`)).rows;
	const ticketBefore = (await db.execute(sql`SELECT * FROM tickets WHERE id = ${ticket.id}`)).rows;
	const longName = `Complete café 名称 ${Array.from({ length: 80 }, (_, n) => createHash("sha256").update(String(n)).digest("hex")).join(" ")}`;
	await expect(db.execute(sql`UPDATE epics SET name = ${longName} WHERE id = ${epic.id}`)).rejects.toThrow(
		"epics_name_check",
	);
	await expect(db.execute(sql`UPDATE waves SET name = ${longName} WHERE id = ${wave.id}`)).rejects.toThrow(
		"waves_name_check",
	);
	await migrate(db);
	expect((await db.execute(sql`SELECT * FROM epics WHERE id = ${epic.id}`)).rows).toEqual(epicBefore);
	expect((await db.execute(sql`SELECT * FROM waves WHERE id = ${wave.id}`)).rows).toEqual(waveBefore);
	expect((await db.execute(sql`SELECT * FROM tickets WHERE id = ${ticket.id}`)).rows).toEqual(ticketBefore);
	const renamedEpic = await db.transaction((tx) => epics.update(ctx, tx, { epic: epic.ref, name: longName }));
	const renamedWave = await db.transaction((tx) => waves.update(ctx, tx, { wave: wave.ref, name: longName }));
	expect(renamedEpic).toMatchObject({ id: epic.id, ref: epic.ref, name: longName, description: epic.description });
	expect(renamedWave).toMatchObject({ id: wave.id, ref: wave.ref, name: longName, epicId: epic.id });
	const read = await db.transaction((tx) => epics.get(ctx, tx, { epic: epic.ref }));
	expect(read.name).toBe(longName);
	expect(read.waves[0]?.name).toBe(longName);
	expect(read.tickets[0]).toMatchObject({
		id: ticket.id,
		epic: { id: epic.id, name: longName },
		wave: { id: wave.id, name: longName },
	});
	expect((await db.transaction((tx) => epics.list(ctx, tx, { project: "TST" })))[0]?.name).toBe(longName);

	const createdEpic = await db.transaction((tx) => epics.create(ctx, tx, { project: "TST", name: longName }));
	const createdWave = await db.transaction((tx) => waves.create(ctx, tx, { epic: createdEpic.id, name: longName }));
	expect(createdEpic.name).toBe(longName);
	expect(createdWave.name).toBe(longName);
	expect(createdEpic.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	expect(createdWave.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	const duplicate = await db.transaction((tx) => epics.create(ctx, tx, { project: "TST", name: longName }));
	expect(duplicate.slug).toBe(`${createdEpic.slug}-2`);
	await expect(
		db.transaction((tx) => epics.create(ctx, tx, { project: "TST", name: longName, slug: createdEpic.slug })),
	).rejects.toMatchObject({ code: "DUPLICATE" });
	await expect(
		db.transaction((tx) => waves.create(ctx, tx, { epic: createdEpic.id, name: longName, slug: createdWave.slug })),
	).rejects.toMatchObject({ code: "DUPLICATE" });
	expect((await db.transaction((tx) => epics.get(ctx, tx, { epic: createdEpic.ref }))).name).toBe(longName);
	const secondWave = await db.transaction((tx) => waves.create(ctx, tx, { epic: createdEpic.id, name: longName }));
	expect(secondWave.slug).toBe(`${createdWave.slug}-2`);
	await expect(db.execute(sql`UPDATE epics SET slug = ${createdEpic.slug} WHERE id = ${epic.id}`)).rejects.toThrow(
		"epics_project_slug_equality",
	);
	await expect(
		db.execute(sql`UPDATE waves SET slug = ${createdWave.slug} WHERE id = ${secondWave.id}`),
	).rejects.toThrow("waves_epic_slug_equality");
	const otherScope = await db.transaction((tx) => waves.create(ctx, tx, { epic: epic.id, name: longName }));
	expect(otherScope.slug).toBe(createdWave.slug);
	const otherProjectId = ulid();
	await db
		.insert(projects)
		.values({ id: otherProjectId, key: "OTH", slug: "oth", name: "Other", createdAt: now, updatedAt: now });
	await db.transaction((tx) => cache.rebuild(tx));
	const otherEpic = await db.transaction((tx) => epics.create(ctx, tx, { project: "OTH", name: longName }));
	expect(otherEpic.slug).toBe(createdEpic.slug);
	for (const name of ["", " padded "]) {
		await expect(db.execute(sql`UPDATE epics SET name = ${name} WHERE id = ${epic.id}`)).rejects.toThrow(
			"epics_name_check",
		);
		await expect(db.execute(sql`UPDATE waves SET name = ${name} WHERE id = ${wave.id}`)).rejects.toThrow(
			"waves_name_check",
		);
	}
	expect(await migrate(db)).toBe(0);
}, 60_000);
