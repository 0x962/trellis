import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ProjectCreateInputSchema,
	ProjectSchema,
	ProjectUpdateInputSchema,
	StatusCreateInputSchema,
	StatusListOutputSchema,
	StatusSchema,
	StatusUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import type { ServiceCtx } from "../../context.ts";
import * as projects from "../../services/projects.ts";
import * as statuses from "../../services/statuses.ts";
import { createCache } from "../cache.ts";
import { openDb } from "../client.ts";
import { migrate } from "../migrate.ts";
import { openTestDbFromArchive } from "../testDb.ts";
import { type Tx, withTx } from "../tx.ts";

let db: Awaited<ReturnType<typeof openDb>>;
let fixtureDirectory: string;
const migrationsDirectory = new URL("../../../drizzle/", import.meta.url);
const cache = createCache();
const at = new Date("2026-09-29T20:00:00.000Z");
const run = async <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) => {
	const { result } = await withTx(db, (tx, emit) =>
		call(
			{
				actor: { name: "test", kind: "human" },
				session: null,
				reqId: "01J00000000000000000000001",
				now: at,
				emit,
				cache,
				actorCache: new Map(),
				dropBlobs: () => undefined,
				publicUrl: "http://127.0.0.1:4521",
			},
			tx,
		),
	);
	return result;
};
const createProject = (key: string, name: string) =>
	run((ctx, tx) => projects.create(ctx, tx, ProjectCreateInputSchema.parse({ key, name })));
const getProject = (project: string) => run((ctx, tx) => projects.get(ctx, tx, { project }));
const name = `Project ${"界🙂é".repeat(3000)}`;
const description = "Review the complete result 界🙂é\n".repeat(1000);
const randomText = Array.from({ length: 400 }, () => crypto.randomUUID().replaceAll("-", "")).join("");
const statusName = `Review ${randomText} 界🙂é`;

beforeAll(async () => {
	fixtureDirectory = await mkdtemp(join(tmpdir(), "trellis-project-metadata-"));
	const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const migrationIndex = journal.entries.find((entry) => entry.tag.endsWith("_complete_text_limits"))!.idx;
	const prior = journal.entries.filter((entry) => entry.idx < migrationIndex);
	await mkdir(join(fixtureDirectory, "meta"));
	await writeFile(join(fixtureDirectory, "meta/_journal.json"), JSON.stringify({ ...journal, entries: prior }));
	for (const entry of prior) {
		await copyFile(new URL(`${entry.tag}.sql`, migrationsDirectory), join(fixtureDirectory, `${entry.tag}.sql`));
	}
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: fixtureDirectory });
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES ('01J00000000000000000000100', 'OLD', 'old', 'Existing project', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, description, slug, category, color, position, is_default, created_at, updated_at)
		VALUES ('01J00000000000000000000101', '01J00000000000000000000100',
			'Todo', 'Existing status.', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	const originalProject = (await db.execute(sql`SELECT * FROM projects WHERE key = 'OLD'`)).rows;
	const originalStatuses = (
		await db.execute(sql`SELECT * FROM statuses WHERE project_id = '01J00000000000000000000100' ORDER BY id`)
	).rows;
	expect(await migrate(db)).toBe(journal.entries.length - prior.length);
	expect(
		(
			await db.execute(sql`SELECT conname, contype::text FROM pg_constraint
			WHERE conname IN ('statuses_project_name_equality', 'statuses_project_slug_equality') ORDER BY conname`)
		).rows,
	).toEqual([
		{ conname: "statuses_project_name_equality", contype: "x" },
		{ conname: "statuses_project_slug_equality", contype: "x" },
	]);
	expect((await db.execute(sql`SELECT * FROM projects WHERE key = 'OLD'`)).rows).toEqual(originalProject);
	expect(
		(await db.execute(sql`SELECT * FROM statuses WHERE project_id = '01J00000000000000000000100' ORDER BY id`)).rows,
	).toEqual(originalStatuses);
	await withTx(db, (tx) => cache.rebuild(tx));
	expect(await getProject("OLD")).toMatchObject({ id: "01J00000000000000000000100", name: "Existing project" });
}, 60_000);

afterAll(async () => {
	await db.$client.close();
	await rm(fixtureDirectory, { recursive: true });
});

test("project create, edit, read, and archive restore preserve complete names", async () => {
	const created = ProjectSchema.parse(await createProject("LONG", name));
	expect(created.name).toBe(name);
	const editedName = `${name} revised`;
	const edited = ProjectSchema.parse(
		await run((ctx, tx) =>
			projects.update(ctx, tx, ProjectUpdateInputSchema.parse({ project: created.id, name: editedName })),
		),
	);
	expect(edited.name).toBe(editedName);
	expect(ProjectSchema.parse(await getProject("LONG")).name).toBe(editedName);
	await expect(createProject("DUP", editedName.toUpperCase())).rejects.toMatchObject({ code: "DUPLICATE" });
	await expect(createProject("LONG", "Other name")).rejects.toMatchObject({ code: "DUPLICATE" });
	const archive = await db.$client.dumpDataDir("none");
	const restored = await openTestDbFromArchive(archive);
	expect((await restored.execute(sql`SELECT name FROM projects WHERE id = ${created.id}`)).rows).toEqual([
		{ name: editedName },
	]);
	await restored.$client.close();
});

test("status create, edit, read, and project ownership preserve complete metadata", async () => {
	const project = await createProject("STATUS", "Status owner");
	const other = await createProject("OTHER", "Other owner");
	const created = StatusSchema.parse(
		await run((ctx, tx) =>
			statuses.create(
				ctx,
				tx,
				StatusCreateInputSchema.parse({ project: project.id, name: statusName, description, category: "review" }),
			),
		),
	);
	expect(created).toMatchObject({ name: statusName, description, projectId: project.id });
	const editedName = `${statusName} revised`;
	const editedDescription = `${description}Complete.`;
	const edited = StatusSchema.parse(
		await run((ctx, tx) =>
			statuses.update(
				ctx,
				tx,
				StatusUpdateInputSchema.parse({
					project: project.id,
					status: statusName,
					name: editedName,
					description: editedDescription,
					isDefault: true,
				}),
			),
		),
	);
	expect(edited).toMatchObject({ name: editedName, description: editedDescription, category: "review" });
	const list = StatusListOutputSchema.parse(await run((ctx, tx) => statuses.list(ctx, tx, { project: project.id })));
	expect(list.statuses.find((status) => status.id === created.id)).toEqual(edited);
	expect(list.statuses.filter((status) => status.isDefault).map((status) => status.id)).toEqual([created.id]);
	await expect(
		run((ctx, tx) => statuses.update(ctx, tx, { project: other.id, status: created.id, description: "Wrong owner" })),
	).rejects.toMatchObject({ code: "STATUS_NOT_IN_PROJECT" });
	await expect(
		run((ctx, tx) => statuses.create(ctx, tx, { project: project.id, name: editedName, category: "review" })),
	).rejects.toMatchObject({ code: "DUPLICATE" });
	const copied = await run((ctx, tx) =>
		statuses.create(ctx, tx, { project: other.id, name: editedName, description, category: "review" }),
	);
	expect(copied.name).toBe(editedName);
	await expect(
		db.execute(sql`UPDATE statuses SET name = ${editedName} WHERE project_id = ${project.id} AND slug = 'todo'`),
	).rejects.toThrow("statuses_project_name_equality");
	await expect(
		db.execute(sql`UPDATE statuses SET slug = ${edited.slug} WHERE project_id = ${project.id} AND slug = 'todo'`),
	).rejects.toThrow("statuses_project_slug_equality");
	await expect(db.execute(sql`UPDATE statuses SET name = '' WHERE id = ${created.id}`)).rejects.toThrow(
		"statuses_name_check",
	);
	await expect(db.execute(sql`UPDATE projects SET name = '' WHERE id = ${project.id}`)).rejects.toThrow(
		"projects_name_check",
	);
});
