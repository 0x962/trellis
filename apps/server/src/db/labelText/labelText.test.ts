import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LabelCreateInputSchema, LabelGroupCreateInputSchema, LabelListOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import * as labelGroups from "../../services/labelGroups.ts";
import { resolveLabel } from "../../services/labelRefs.ts";
import * as labels from "../../services/labels.ts";
import { createCache } from "../cache.ts";
import { type Db, openDb } from "../client.ts";
import { type Tx, withTx } from "../tx.ts";

const projectId = "01J00000000000000000000010";
const otherProjectId = "01J00000000000000000000011";
const at = new Date("2026-09-29T12:00:00.000Z");
const name = Array.from({ length: 256 }, (_, i) => createHash("sha256").update(String(i)).digest("hex")).join("");
const description = "Label description. ".repeat(2000);
const directory = join(import.meta.dir, "../../../drizzle");
let db: Db;
let cache: ReturnType<typeof createCache>;

const run = async <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) =>
	(
		await withTx(db, (tx, emit) =>
			call(
				{
					actor: { name: "test", kind: "human" },
					session: null,
					reqId: projectId,
					now: at,
					emit,
					cache,
					actorCache: new Map(),
					dropBlobs: () => undefined,
					publicUrl: "http://127.0.0.1:4521",
				},
				tx,
			),
		)
	).result;

beforeAll(async () => {
	const journal = JSON.parse(readFileSync(join(directory, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	expect(journal.entries.some((entry) => entry.idx === 138)).toBe(true);
	db = await openDb(":memory:");
	for (const entry of journal.entries.filter((entry) => entry.idx < 138)) {
		await db.$client.exec(readFileSync(join(directory, `${entry.tag}.sql`), "utf8"));
	}
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at) VALUES
		(${projectId},'TST','tst','Test',${at},${at}),
		(${otherProjectId},'OTH','oth','Other',${at},${at})`);
	await db.execute(sql`INSERT INTO label_groups (id,project_id,name,created_at,updated_at)
		VALUES ('old-group',${projectId},'Existing group',${at},${at})`);
	await db.execute(sql`INSERT INTO labels (id,project_id,group_id,name,color,description,created_at,updated_at)
		VALUES ('old-label',${projectId},'old-group','Existing label','blue','Existing description',${at},${at})`);
	const before = await db.execute(sql`SELECT row_to_json(l) AS row FROM labels l`);
	const groupsBefore = await db.execute(sql`SELECT row_to_json(g) AS row FROM label_groups g`);
	await expect(db.execute(sql`UPDATE labels SET name = ${name} WHERE id = 'old-label'`)).rejects.toThrow();
	for (const entry of journal.entries.filter((entry) => entry.idx >= 138)) {
		await db.$client.exec(readFileSync(join(directory, `${entry.tag}.sql`), "utf8"));
	}
	expect((await db.execute(sql`SELECT row_to_json(l) AS row FROM labels l`)).rows).toEqual(before.rows);
	expect((await db.execute(sql`SELECT row_to_json(g) AS row FROM label_groups g`)).rows).toEqual(groupsBefore.rows);
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("the migrated services create, read, resolve, and update complete label text", async () => {
	const group = await run((ctx, tx) =>
		labelGroups.create(ctx, tx, LabelGroupCreateInputSchema.parse({ project: "TST", name })),
	);
	const label = await run((ctx, tx) =>
		labels.create(ctx, tx, LabelCreateInputSchema.parse({ project: "TST", name, description, group: name })),
	);
	expect(label.name).toBe(name);
	expect(label.description).toBe(description.trim());
	const resolved = await run((ctx, tx) => resolveLabel(ctx, tx, { projectId, ref: `${name}/${name}` }));
	expect(resolved.id).toBe(label.id);
	const renamed = await run((ctx, tx) =>
		labelGroups.update(ctx, tx, { project: "TST", group: group.id, name: `${name} group` }),
	);
	expect(renamed.name).toBe(`${name} group`);
	const changed = await run((ctx, tx) =>
		labels.update(ctx, tx, {
			project: "TST",
			label: label.id,
			name: `${name} label`,
			description: `${description}end`,
		}),
	);
	const listed = LabelListOutputSchema.parse(await run((ctx, tx) => labels.list(ctx, tx, { project: "TST" })));
	expect(listed.labels.find((item) => item.id === label.id)).toEqual(changed);
	expect(changed.description).toBe(`${description}end`);
	await expect(
		run((ctx, tx) => labels.update(ctx, tx, { project: "OTH", label: label.id, name: "Foreign" })),
	).rejects.toThrow();
	await expect(
		run((ctx, tx) => labels.create(ctx, tx, { project: "OTH", name: "Foreign", group: group.id })),
	).rejects.toThrow();
});

test("long names retain case-insensitive uniqueness within each scope", async () => {
	const first = await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name }));
	await expect(
		run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: name.toUpperCase() })),
	).rejects.toThrow();
	await expect(
		run((ctx, tx) => labelGroups.create(ctx, tx, { project: "TST", name: name.toUpperCase() })),
	).rejects.toThrow();
	const other = await run((ctx, tx) => labels.create(ctx, tx, { project: "OTH", name }));
	expect(other.projectId).toBe(otherProjectId);
	await expect(
		db.execute(sql`INSERT INTO labels (id,project_id,name,color,created_at,updated_at)
		VALUES ('duplicate',${projectId},${name.toUpperCase()},'red',${at},${at})`),
	).rejects.toThrow();
	const extended = await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: `${name} tail` }));
	expect(extended.id).not.toBe(first.id);
});

test("database checks retain invalid-name and color rejection", async () => {
	for (const invalid of ["", " padded ", "a,b", "a/b", "NoNe"]) {
		await expect(db.execute(sql`UPDATE labels SET name = ${invalid} WHERE id = 'old-label'`)).rejects.toThrow();
		await expect(db.execute(sql`UPDATE label_groups SET name = ${invalid} WHERE id = 'old-group'`)).rejects.toThrow();
	}
	await expect(db.execute(sql`UPDATE labels SET color = 'invalid' WHERE id = 'old-label'`)).rejects.toThrow();
});
