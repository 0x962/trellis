import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { TrustedFolderSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { seedChild, seedProject } from "../../test/fixtures";
import { activityRows, type Harness, serviceHarness } from "../../test/helpers/services.ts";
import { addTrustedFolder, effectiveTrustedRoots, setTrustedFolders } from "./projectsTrustedFolders.ts";

// `setTrustedFolders` replaces the whole list of one project. A repeated
// path collapses to one row, one activity row on the project records the
// old list and the new list, and the effective roots of a project are its
// own plus its ancestors'.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const set = (project: string, paths: string[]) => h.run((ctx, tx) => setTrustedFolders(ctx, tx, { project, paths }));

const pathRows = (projectId: string) =>
	h.rows<{ path: string }>(sql`SELECT path FROM trusted_folders WHERE project_id = ${projectId} ORDER BY path`);

const seedCde = async () => {
	const { rootId } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, rootId, rootId, "web");
	await h.rebuild();
	return { cde: rootId, web };
};

describe("projects.setTrustedFolders", () => {
	test("a replace stores one row per distinct path, sorted", async () => {
		const { cde } = await seedCde();
		const result = await set("CDE", ["/src/web", "/a/one", "/a/one"]);
		expect(await pathRows(cde)).toEqual([{ path: "/a/one" }, { path: "/src/web" }]);
		expect(result.map((folder) => folder.path)).toEqual(["/a/one", "/src/web"]);
		expect(TrustedFolderSchema.parse(result[0])).toMatchObject({ projectId: cde, path: "/a/one" });
	});

	test("a replace drops the paths it leaves out and an empty list clears the project", async () => {
		const { cde } = await seedCde();
		await set("CDE", ["/a/one", "/a/two"]);
		await set("CDE", ["/a/two"]);
		expect(await pathRows(cde)).toEqual([{ path: "/a/two" }]);
		expect(await set("CDE", [])).toEqual([]);
		expect(await pathRows(cde)).toEqual([]);
	});

	// A folder trust decides what an agent may run, so the change is
	// activity a person reads later.
	test("a replace writes one activity row for the trustedFolders field", async () => {
		const { cde } = await seedCde();
		await set("CDE", ["/a/one"]);
		await set("CDE", ["/a/two"]);
		const rows = await activityRows(h);
		const row = rows.at(-1)!;
		expect(row.field).toBe("trustedFolders");
		expect(row.ticket_id).toBeNull();
		expect(row.project_id).toBe(cde);
		expect(row.meta).toMatchObject({ from: ["/a/one"], to: ["/a/two"] });
	});

	test("an equal list writes nothing", async () => {
		await seedCde();
		await set("CDE", ["/a/one"]);
		const before = (await activityRows(h)).length;
		await set("CDE", ["/a/one"]);
		expect((await activityRows(h)).length).toBe(before);
	});
});

describe("effective trusted roots", () => {
	// One manager serves a whole tree, so a folder a parent trusts covers
	// the agents of every project under it.
	test("the roots of a sub-project are its own plus its ancestors'", async () => {
		const { cde, web } = await seedCde();
		await set("CDE", ["/src/root"]);
		await h.run((ctx, tx) => setTrustedFolders(ctx, tx, { project: "CDE.web", paths: ["/src/web"] }));
		expect(await h.run((ctx, tx) => effectiveTrustedRoots(ctx, tx, web))).toEqual(["/src/root", "/src/web"]);
		expect(await h.run((ctx, tx) => effectiveTrustedRoots(ctx, tx, cde))).toEqual(["/src/root"]);
	});
});

describe("addTrustedFolder", () => {
	test("a path no root holds is added, and a path a root already holds is not", async () => {
		const { cde } = await seedCde();
		expect(await h.run((ctx, tx) => addTrustedFolder(ctx, tx, cde, "/src/web"))).toBe(true);
		expect(await h.run((ctx, tx) => addTrustedFolder(ctx, tx, cde, "/src/web"))).toBe(false);
		expect(await pathRows(cde)).toEqual([{ path: "/src/web" }]);
	});

	// The default folder of a sub-project is the repo root its parent
	// already trusts, so the sub-project needs no row of its own.
	test("a path an ancestor holds is not added again", async () => {
		const { web } = await seedCde();
		await set("CDE", ["/src/web"]);
		expect(await h.run((ctx, tx) => addTrustedFolder(ctx, tx, web, "/src/web"))).toBe(false);
		expect(await pathRows(web)).toEqual([]);
	});
});
