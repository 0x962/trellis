import { describe, expect, test } from "bun:test";
import type { Project, TrustedFolder } from "@trellis/api";
import { createTestApp, NAVID } from "../../test/helpers/app.ts";

// The trusted folders of a project over app.request. The list is the
// permission trellis has to mark a folder trusted for the agents of that
// project, and it is a full replace like the repo list.

const t = await createTestApp();

const put = (project: string, paths: string[]) =>
	t.api(`/api/projects/${project}/trusted-folders`, { method: "PUT", body: { paths }, actor: NAVID });

const foldersOf = async (project: string): Promise<TrustedFolder[]> =>
	(await t.api(`/api/projects/${project}`, { actor: null })).body.trustedFolders as TrustedFolder[];

const seed = async (key: string): Promise<Project> => t.seedProject(key);

describe("projects.setTrustedFolders", () => {
	test("a replace stores the paths sorted and the project reads them back", async () => {
		await seed("TFA");
		const response = await put("TFA", ["/src/web", "/Users/navid/projects/trellis"]);
		expect(response.status).toBe(200);
		expect((response.body as TrustedFolder[]).map((folder) => folder.path)).toEqual([
			"/Users/navid/projects/trellis",
			"/src/web",
		]);
		expect((await foldersOf("TFA")).map((folder) => folder.path)).toEqual([
			"/Users/navid/projects/trellis",
			"/src/web",
		]);
	});

	test("a second replace removes the paths it leaves out, and an empty list clears the project", async () => {
		await seed("TFB");
		await put("TFB", ["/a/one", "/a/two"]);
		await put("TFB", ["/a/two"]);
		expect((await foldersOf("TFB")).map((folder) => folder.path)).toEqual(["/a/two"]);
		expect((await put("TFB", [])).status).toBe(200);
		expect(await foldersOf("TFB")).toEqual([]);
	});

	test("a duplicate path stores one row", async () => {
		await seed("TFC");
		const response = await put("TFC", ["/a/one", "/a/one"]);
		expect((response.body as TrustedFolder[]).map((folder) => folder.path)).toEqual(["/a/one"]);
	});

	// A relative path names no folder the runner can resolve, and a
	// trailing slash makes two spellings of one folder.
	test("a path that is not absolute, or carries a trailing slash, is refused", async () => {
		await seed("TFD");
		expect((await put("TFD", ["projects/trellis"])).status).toBe(400);
		expect((await put("TFD", ["/Users/navid/"])).status).toBe(400);
		expect(await foldersOf("TFD")).toEqual([]);
	});

	test("an archived project takes no trusted folder", async () => {
		await seed("TFF");
		await t.api("/api/projects/TFF", { method: "PATCH", body: { archived: true }, actor: NAVID });
		const refused = await put("TFF", ["/a/one"]);
		expect(refused.status).toBe(409);
		expect(refused.body.code).toBe("PROJECT_ARCHIVED");
	});
});
