import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { RepoSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import * as projects from "../../../../src/services/projects.ts";
import { insertRow, seedChild, seedProject } from "../../../fixtures";
import { activityRows, type Harness, serviceHarness } from "../../../helpers/services.ts";

// `setRepos` replaces the whole repo set of one project. Owner and repo are
// stored in lower case, a repeated pair collapses to one row, and one
// activity row on the project records the old list and the new list. The
// effective repos of a project are its own plus its ancestors'.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Pair = { owner: string; repo: string };

const setRepos = (project: string, repos: Pair[]) => h.run((ctx, tx) => projects.setRepos(ctx, tx, { project, repos }));

const repoRows = (projectId: string) =>
	h.rows<Pair>(sql`SELECT owner, repo FROM repos WHERE project_id = ${projectId} ORDER BY owner, repo`);

const seedRepo = (projectId: string, pair: Pair) =>
	insertRow(h.db, "repos", { id: ulid(), project_id: projectId, owner: pair.owner, repo: pair.repo });

const seedCde = async () => {
	const { rootId } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, rootId, rootId, "web");
	await h.rebuild();
	return { cde: rootId, web };
};

describe("projects.setRepos", () => {
	test("setRepos stores the owner and the repo in lower case", async () => {
		const { cde } = await seedCde();
		const result = await setRepos("CDE", [{ owner: "Acme", repo: "Web" }]);
		expect(await repoRows(cde)).toEqual([{ owner: "acme", repo: "web" }]);
		expect(result).toHaveLength(1);
		const parsed = RepoSchema.parse(result[0]);
		expect(parsed).toMatchObject({ projectId: cde, owner: "acme", repo: "web" });
	});

	test("setRepos replaces the whole set and an empty array clears it", async () => {
		const { cde } = await seedCde();
		await seedRepo(cde, { owner: "a", repo: "b" });
		await seedRepo(cde, { owner: "c", repo: "d" });
		const replaced = await setRepos("CDE", [{ owner: "e", repo: "f" }]);
		expect(await repoRows(cde)).toEqual([{ owner: "e", repo: "f" }]);
		expect(replaced.map((repo) => `${repo.owner}/${repo.repo}`)).toEqual(["e/f"]);
		const cleared = await setRepos("CDE", []);
		expect(cleared).toEqual([]);
		expect(await repoRows(cde)).toEqual([]);
	});

	test("a repeated pair collapses to one repo row", async () => {
		const { cde } = await seedCde();
		const result = await setRepos("CDE", [
			{ owner: "acme", repo: "web" },
			{ owner: "Acme", repo: "Web" },
		]);
		expect(await repoRows(cde)).toEqual([{ owner: "acme", repo: "web" }]);
		expect(result).toHaveLength(1);
	});

	test("setRepos writes one activity row for the repos field", async () => {
		const { cde } = await seedCde();
		await seedRepo(cde, { owner: "a", repo: "b" });
		await setRepos("CDE", [{ owner: "c", repo: "d" }]);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		expect(row.field).toBe("repos");
		expect(row.ticket_id).toBeNull();
		expect(row.project_id).toBe(cde);
		expect(row.meta).toMatchObject({ from: [{ owner: "a", repo: "b" }], to: [{ owner: "c", repo: "d" }] });
	});
});

describe("effective repos", () => {
	test("the effective repos are the project's own plus its ancestors'", async () => {
		const { cde, web } = await seedCde();
		await seedRepo(cde, { owner: "a", repo: "b" });
		await seedRepo(web, { owner: "c", repo: "d" });
		await seedRepo(web, { owner: "a", repo: "b" });
		const effective = await h.run((ctx, tx) => projects.effectiveRepos(ctx, tx, { project: "CDE.web" }));
		const pairs = effective.map((repo) => `${repo.owner}/${repo.repo}`).sort();
		expect(pairs).toEqual(["a/b", "c/d"]);
		for (const repo of effective) RepoSchema.parse(repo);
	});
});
