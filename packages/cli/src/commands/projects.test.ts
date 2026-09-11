import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { project, projectSummary, repo } from "../../test/fixtures.ts";

const listRows = [projectSummary(), projectSummary({ path: "CDE.web", slug: "web", name: "Web", depth: 1 })];

describe("projects", () => {
	// CLI-68
	test("projects list maps --archived", async () => {
		const archived = await runCli(["projects", "list", "--archived"], { "projects.list": listRows });
		expect(archived.code).toBe(0);
		expect(archived.calls[0]).toMatchObject({ path: "projects.list", input: { archived: true } });

		const live = await runCli(["projects", "list"], { "projects.list": listRows });
		expect(live.calls[0]!.input).not.toHaveProperty("archived");

		const table = await runCli(["projects", "list"], { "projects.list": listRows }, { tty: true });
		const [header, ...rows] = lines(table.stdout);
		expect(header!.trim().toLowerCase()).toStartWith("path");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toStartWith("CDE");
		expect(rows[1]).toStartWith("CDE.web");

		const quiet = await runCli(["projects", "list", "--quiet"], { "projects.list": listRows });
		expect(lines(quiet.stdout)).toEqual(["CDE", "CDE.web"]);
	});

	// CLI-69
	test("projects create maps a root", async () => {
		const result = await runCli(["projects", "create", "--key", "CDE", "--name", "Code", "--description", "D"], {
			"projects.create": project(),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "projects.create" });
		expect(result.calls[0]!.input).toEqual({ key: "CDE", name: "Code", description: "D" });
	});

	// CLI-70
	test("projects create maps a sub-project", async () => {
		const result = await runCli(["projects", "create", "--parent", "CDE", "--name", "Web"], {
			"projects.create": project({ path: "CDE.web" }),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ parent: "CDE", name: "Web" });
	});

	// CLI-71
	test("projects show maps the ref", async () => {
		const result = await runCli(["projects", "show", "CDE.web"], { "projects.get": project() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "projects.get", input: { project: "CDE.web" } });
		for (const key of ["ancestors", "children", "repos", "statuses"]) {
			expect(result.stdout, key).toContain(key);
		}
	});

	// CLI-72
	test("projects move maps parent and anchors", async () => {
		const moved = await runCli(["projects", "move", "CDE.web", "--parent", "CDE.app", "--after", "CDE.app.auth"], {
			"projects.move": project(),
		});
		expect(moved.code).toBe(0);
		expect(moved.calls[0]).toMatchObject({ path: "projects.move" });
		expect(moved.calls[0]!.input).toEqual({ project: "CDE.web", parent: "CDE.app", after: "CDE.app.auth" });

		const top = await runCli(["projects", "move", "CDE.web", "--parent", "none"], { "projects.move": project() });
		expect(top.calls[0]!.input).toEqual({ project: "CDE.web", parent: null });
	});

	// CLI-73
	test("projects repos reads then replaces the set", async () => {
		const routes = {
			"projects.get": project({ repos: [repo("old"), repo("web")] }),
			"projects.setRepos": [repo("web"), repo("trellis")],
		};
		const result = await runCli(
			["projects", "repos", "CDE", "--add", "0x962/trellis", "--remove", "0x962/old"],
			routes,
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["projects.get", "projects.setRepos"]);
		expect(result.calls[0]!.input).toEqual({ project: "CDE" });
		expect(result.calls[1]!.input).toEqual({
			project: "CDE",
			repos: [
				{ owner: "0x962", repo: "web" },
				{ owner: "0x962", repo: "trellis" },
			],
		});

		const again = await runCli(["projects", "repos", "CDE", "--add", "0x962/web"], routes);
		expect(again.calls[1]!.input).toEqual({
			project: "CDE",
			repos: [
				{ owner: "0x962", repo: "old" },
				{ owner: "0x962", repo: "web" },
			],
		});
	});
});
