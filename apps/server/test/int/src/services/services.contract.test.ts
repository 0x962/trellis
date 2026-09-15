import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { record } from "../../../../src/services/activity.ts";
import * as actors from "../../../../src/services/actors.ts";
import * as projects from "../../../../src/services/projects.ts";
import * as settings from "../../../../src/services/settings.ts";
import * as statuses from "../../../../src/services/statuses.ts";
import { count, seedChild, seedProject } from "../../../fixtures";
import { expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";

// The rules every service module keeps: it takes (ctx, tx, input) in that
// order, it never imports the database client, it writes only through the
// transaction it receives, and its events reach the sink after the commit
// or never.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const src = join(originDir(import.meta.dir), "..");

// Every source file under src/services and src/events, tests excluded.
const moduleFiles = (dir: string) =>
	readdirSync(join(src, dir))
		.filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
		.map((entry) => join(dir, entry));

describe("service transactions", () => {
	test("a rollback drops every row and every queued event", async () => {
		const sink: unknown[] = [];
		const run = h.runWithSink(
			async (ctx, tx) => {
				await projects.create(ctx, tx, { key: "CDE", name: "Code" });
				throw new Error("abort");
			},
			(events) => {
				sink.push(...events);
			},
		);
		await expect(run).rejects.toThrow("abort");
		for (const table of ["projects", "statuses", "actors", "activity"]) {
			expect(await count(h.db, table), table).toBe(0);
		}
		expect(sink).toEqual([]);
	});

	// A sink that queries while the transaction is open waits on the lock the
	// transaction holds and the test times out.
	test("events reach the sink only after the commit", async () => {
		let serviceReturned = false;
		const observed: Array<{ serviceReturned: boolean; projects: number; types: string[] }> = [];
		await h.runWithSink(
			async (ctx, tx) => {
				const created = await projects.create(ctx, tx, { key: "CDE", name: "Code" });
				expect(observed).toEqual([]);
				serviceReturned = true;
				return created;
			},
			async (events) => {
				observed.push({ serviceReturned, projects: await count(h.db, "projects"), types: events.map((e) => e.type) });
			},
		);
		expect(observed).toEqual([{ serviceReturned: true, projects: 1, types: ["project.created"] }]);
	}, 2000);
});

describe("service modules", () => {
	test("no service module imports the database client", () => {
		const files = [...moduleFiles("services"), ...moduleFiles("events")];
		expect(files.length).toBeGreaterThanOrEqual(7);
		for (const file of files) {
			const source = readFileSync(join(src, file), "utf8");
			expect(source, file).not.toMatch(/from\s+["'][^"']*db\/client(\.ts)?["']/);
			expect(source, file).not.toMatch(/^\s*(export\s+)?(const|let|var)\s+db\b/m);
		}
	});

	// A service with no actor cannot write its actor row, so a mutation with
	// a null actor throws before it touches a table. That the throw is
	// ACTOR_REQUIRED proves the first argument is read as the context.
	test("every service takes ctx, tx, and input in that order", async () => {
		const { rootId: cde, statuses: s } = await seedProject(h.db, "CDE");
		await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		const mutations: Record<
			string,
			(ctx: Parameters<typeof projects.create>[0], tx: Parameters<typeof projects.create>[1]) => Promise<unknown>
		> = {
			"projects.create": (ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Api" }),
			"projects.update": (ctx, tx) => projects.update(ctx, tx, { project: "CDE.web", name: "Site" }),
			"projects.move": (ctx, tx) => projects.move(ctx, tx, { project: "CDE.web", parent: null }),
			"projects.delete": (ctx, tx) => projects.delete(ctx, tx, { project: "CDE.web" }),
			"projects.setRepos": (ctx, tx) => projects.setRepos(ctx, tx, { project: "CDE", repos: [] }),
			"statuses.create": (ctx, tx) =>
				statuses.create(ctx, tx, { project: "CDE", name: "Blocked", category: "started" }),
			"statuses.update": (ctx, tx) => statuses.update(ctx, tx, { project: "CDE", status: "todo", name: "Backlog" }),
			"statuses.reorder": (ctx, tx) => statuses.reorder(ctx, tx, { project: "CDE", statuses: Object.values(s) }),
			"statuses.delete": (ctx, tx) => statuses.delete(ctx, tx, { project: "CDE", status: "canceled" }),
			"statuses.clear": (ctx, tx) => statuses.clear(ctx, tx, { project: "CDE.web" }),
			"activity.record": (ctx, tx) =>
				record(ctx, tx, { rootId: cde, projectId: cde, ticketId: null, action: "project.updated", changes: [] }),
			"settings.set": (ctx, tx) =>
				settings.set(ctx, tx, {
					defaultActorName: "dana",
				}),
		};
		for (const [name, mutation] of Object.entries(mutations)) {
			const error = await expectError(
				h.run((ctx, tx) => mutation(ctx, tx), { actor: null }),
				"ACTOR_REQUIRED",
			);
			expect(error.code, name).toBe("ACTOR_REQUIRED");
		}
		expect(await count(h.db, "activity")).toBe(0);
		expect(await h.rows(sql`SELECT name FROM projects ORDER BY name`)).toEqual([
			{ name: "CDE" },
			{ name: "Project web" },
		]);

		const reads = await h.read(async (tx) => {
			const ctx = h.ctx(() => {}, { actor: null });
			return {
				project: (await projects.get(ctx, tx, { project: "CDE" })).key,
				actors: (await actors.list(ctx, tx)).length,
				settings: Object.keys(await settings.get(ctx, tx)).length,
			};
		});
		expect(reads).toEqual({ project: "CDE", actors: 3, settings: 2 });
	});
});
