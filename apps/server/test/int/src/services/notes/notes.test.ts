import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as notes from "../../../../../src/services/notes/notes.ts";
import { claude, seedChild, seedProject } from "../../../../fixtures";
import {
	expectError,
	type Harness,
	minutesAgo,
	NOW,
	secondsAfter,
	serviceHarness,
} from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let rootId: string;
let webId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	rootId = (await seedProject(h.db)).rootId;
	webId = await seedChild(h.db, rootId, rootId, "web");
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,created_at,updated_at)
		VALUES ('claude','Builder','Builder','builder','Build',${webId},'CDE.web',now(),now())`);
	await h.rebuild();
});

const add = (project: string, title: string, body = "Body.", extra: Record<string, unknown> = {}) =>
	h.run((ctx, tx) => notes.create(ctx, tx, { project, title, body, ...extra }));

test("a note carries its project path, its writer, and the defaults", async () => {
	const note = await add("CDE.web", "Fresh worktree", "Run bun install first.");
	expect(note).toMatchObject({
		projectId: webId,
		projectPath: "CDE.web",
		title: "Fresh worktree",
		body: "Run bun install first.",
		audience: "all",
		expiresAt: null,
		actor: { name: "dana", kind: "human" },
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
	});
	expect(h.flushed).toEqual([{ type: "notes.changed", projectId: webId }]);
});

test("an agent writer is named by its persona", async () => {
	const note = await h.run((ctx, tx) => notes.create(ctx, tx, { project: "CDE", title: "CI", body: "Red on main." }), {
		actor: claude,
	});
	expect(note.actor).toEqual({ name: "claude", kind: "agent", displayName: "Builder" });
});

test("a sub-project lists its own notes and the notes of its ancestors, newest change first", async () => {
	await add("CDE", "Root fact", "Root.", {});
	const own = await h.run((ctx, tx) => notes.create(ctx, tx, { project: "CDE.web", title: "Web fact", body: "Web." }), {
		now: secondsAfter(60),
	});
	const web = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE.web" }));
	expect(web.map((note) => note.title)).toEqual(["Web fact", "Root fact"]);
	expect(web[0]!.id).toBe(own.id);
	const root = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE" }));
	expect(root.map((note) => note.title)).toEqual(["Root fact"]);
});

test("an audience filter keeps that audience and all", async () => {
	await add("CDE", "Everyone", "All.", { audience: "all" });
	await add("CDE", "Managers", "Manager.", { audience: "manager" });
	await add("CDE", "Workers", "Worker.", { audience: "worker" });
	const forWorkers = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE.web", audience: "worker" }));
	expect(forWorkers.map((note) => note.title).sort()).toEqual(["Everyone", "Workers"]);
	const active = await h.run((ctx, tx) => notes.activeNotes(ctx, tx, { projectId: webId, audience: "manager" }));
	expect(active.map((note) => note.title).sort()).toEqual(["Everyone", "Managers"]);
});

test("an expired note leaves the list and the active set unless the read asks for it", async () => {
	await add("CDE", "Disk", "89 GiB free.", { expiresAt: minutesAgo(1).toISOString() });
	await add("CDE", "Release", "e740 is active.", { expiresAt: secondsAfter(3600).toISOString() });
	const live = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE" }));
	expect(live.map((note) => note.title)).toEqual(["Release"]);
	const active = await h.run((ctx, tx) => notes.activeNotes(ctx, tx, { projectId: rootId, audience: "worker" }));
	expect(active.map((note) => note.title)).toEqual(["Release"]);
	const all = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE", includeExpired: true }));
	expect(all.map((note) => note.title).sort()).toEqual(["Disk", "Release"]);
});

test("a title is unique in its project without case, and free in another project", async () => {
	await add("CDE", "Fresh worktree");
	await expectError(add("CDE", "fresh WORKTREE"), "DUPLICATE");
	const child = await add("CDE.web", "Fresh worktree", "The same title one level down.");
	expect(child.projectId).toBe(webId);
});

test("an update keeps the fields it does not name and records the new writer", async () => {
	const note = await add("CDE", "Disk", "89 GiB free.", {
		audience: "manager",
		expiresAt: secondsAfter(60).toISOString(),
	});
	const updated = await h.run((ctx, tx) => notes.update(ctx, tx, { id: note.id, body: "92 GiB free." }), {
		actor: claude,
		now: secondsAfter(30),
	});
	expect(updated).toMatchObject({
		title: "Disk",
		body: "92 GiB free.",
		audience: "manager",
		expiresAt: note.expiresAt,
		actor: { name: "claude", kind: "agent" },
		createdAt: NOW.toISOString(),
		updatedAt: secondsAfter(30).toISOString(),
	});
	const cleared = await h.run((ctx, tx) => notes.update(ctx, tx, { id: note.id, expiresAt: null }));
	expect(cleared.expiresAt).toBeNull();
	await add("CDE", "Release");
	await expectError(
		h.run((ctx, tx) => notes.update(ctx, tx, { id: note.id, title: "release" })),
		"DUPLICATE",
	);
	const same = await h.run((ctx, tx) => notes.update(ctx, tx, { id: note.id, title: "DISK" }));
	expect(same.title).toBe("DISK");
});

test("a delete removes the note and emits the change for its project", async () => {
	const note = await add("CDE.web", "Gone");
	h.flushed.length = 0;
	const deleted = await h.run((ctx, tx) => notes.remove(ctx, tx, { id: note.id }));
	expect(deleted).toEqual({ id: note.id });
	expect(h.flushed).toEqual([{ type: "notes.changed", projectId: webId }]);
	await expectError(
		h.run((ctx, tx) => notes.get(ctx, tx, { id: note.id })),
		"NOT_FOUND",
	);
});

test("an archived project accepts no note write and still serves reads", async () => {
	const note = await add("CDE.web", "Before");
	await h.rows(sql`UPDATE projects SET archived_at = now() WHERE id = ${rootId}`);
	await h.rebuild();
	await expectError(add("CDE.web", "After"), "PROJECT_ARCHIVED");
	await expectError(
		h.run((ctx, tx) => notes.update(ctx, tx, { id: note.id, body: "Changed." })),
		"PROJECT_ARCHIVED",
	);
	await expectError(
		h.run((ctx, tx) => notes.remove(ctx, tx, { id: note.id })),
		"PROJECT_ARCHIVED",
	);
	const listed = await h.run((ctx, tx) => notes.list(ctx, tx, { project: "CDE.web" }));
	expect(listed.map((item) => item.id)).toEqual([note.id]);
});

test("a project delete takes its notes with it", async () => {
	await add("CDE.web", "Web fact");
	await h.rows(sql`DELETE FROM projects WHERE id = ${webId}`);
	expect(await h.rows(sql`SELECT id FROM notes`)).toEqual([]);
});
