import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { rpcError } from "../../../fakeServer.ts";
import { projectId, status, statusSet } from "../../../fixtures.ts";

describe("statuses", () => {
	// CLI-74
	test("statuses list maps the project", async () => {
		const result = await runCli(["statuses", "list", "CDE"], { "statuses.list": statusSet() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.list", input: { project: "CDE" } });
		const [header, ...rows] = lines(result.stdout);
		expect(header!.trim().toLowerCase()).toStartWith("slug");
		expect(rows.map((row) => row.split(/\s+/)[0])).toEqual(["todo", "in-progress", "blocked"]);

		const quiet = await runCli(["statuses", "list", "CDE", "--quiet"], { "statuses.list": statusSet() });
		expect(lines(quiet.stdout)).toEqual(["todo", "in-progress", "blocked"]);
	});

	// CLI-74: `--json` is the procedure output, which carries `inheritedFrom`
	// beside the statuses. `--jsonl` is one status per line.
	test("statuses list prints the set as JSON and one status per line as JSONL", async () => {
		const json = await runCli(["statuses", "list", "CDE", "--json"], { "statuses.list": statusSet() });
		expect(JSON.parse(json.stdout)).toEqual(statusSet());
		const jsonl = await runCli(["statuses", "list", "CDE", "--jsonl"], { "statuses.list": statusSet() });
		const rows = lines(jsonl.stdout);
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => JSON.parse(row))).toEqual(statusSet().statuses);
	});

	// CLI-75
	test("statuses add maps every flag", async () => {
		const argv = [
			...["statuses", "add", "CDE", "Blocked"],
			...["--category", "review", "--reviewer", "agent", "--color", "danger", "--position", "2", "--default"],
		];
		const result = await runCli(argv, { "statuses.create": status({ slug: "blocked", name: "Blocked" }) });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.create" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			name: "Blocked",
			category: "review",
			reviewer: "agent",
			color: "danger",
			position: 2,
			isDefault: true,
		});
	});

	// CLI-76
	test("statuses edit maps its flags", async () => {
		const argv = [
			...["statuses", "edit", "CDE", "blocked"],
			...["--name", "Stuck", "--color", "success", "--reviewer", "human", "--default"],
		];
		const result = await runCli(argv, { "statuses.update": status({ slug: "stuck", name: "Stuck" }) });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.update" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			status: "blocked",
			name: "Stuck",
			color: "success",
			reviewer: "human",
			isDefault: true,
		});
	});

	// CLI-77
	test("statuses edit refuses --category", async () => {
		const result = await runCli(["statuses", "edit", "CDE", "blocked", "--category", "done"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr.toLowerCase()).toContain("immutable");
		expect(result.calls).toEqual([]);
	});

	// CLI-78
	test("statuses edit --position reorders", async () => {
		const result = await runCli(["statuses", "edit", "CDE", "blocked", "--position", "0"], {
			"statuses.list": statusSet(),
			"statuses.reorder": statusSet(),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.path).toBe("statuses.list");
		expect(result.calls[1]).toMatchObject({
			path: "statuses.reorder",
			input: { project: "CDE", statuses: ["blocked", "todo", "in-progress"] },
		});
	});

	// CLI-78: a `category:` ref names the first status of that category in
	// the set, and a ref that matches no status is not found.
	test("statuses edit --position takes a category ref and refuses an unknown ref", async () => {
		const result = await runCli(["statuses", "edit", "CDE", "category:started", "--position", "0"], {
			"statuses.list": statusSet(),
			"statuses.reorder": statusSet(),
		});
		expect(result.code).toBe(0);
		expect(result.calls[1]).toMatchObject({
			path: "statuses.reorder",
			input: { project: "CDE", statuses: ["in-progress", "todo", "blocked"] },
		});

		const missing = await runCli(["statuses", "edit", "CDE", "nope", "--position", "0"], {
			"statuses.list": statusSet(),
		});
		expect(missing.code).toBe(3);
		expect(missing.stderr).toBe("error: No status matches nope. (NOT_FOUND)\n");
		expect(missing.calls.map((call) => call.path)).toEqual(["statuses.list"]);
	});

	// CLI-78: a run prints one document. With a field flag and `--position`
	// the reordered set is the last state, and it carries the new name.
	test("statuses edit with a field and --position prints one JSON document", async () => {
		const result = await runCli(
			["statuses", "edit", "CDE", "blocked", "--name", "Stuck", "--position", "0", "--json"],
			{
				"statuses.update": status({ slug: "blocked", name: "Stuck" }),
				"statuses.list": statusSet(),
				"statuses.reorder": statusSet(),
			},
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["statuses.update", "statuses.list", "statuses.reorder"]);
		expect(JSON.parse(result.stdout)).toEqual(statusSet().statuses);
	});

	// CLI-78: the position is an index in the column order. A value that is
	// not a whole number stops the run, and no reorder writes the wrong order.
	test("statuses edit refuses a --position that is not a whole number", async () => {
		for (const value of ["abc", "1.5", "-1", ""]) {
			const result = await runCli(["statuses", "edit", "CDE", "blocked", "--position", value], {
				"statuses.list": statusSet(),
				"statuses.reorder": statusSet(),
			});
			expect(result.code, value).toBe(2);
			expect(lines(result.stderr), value).toHaveLength(1);
			expect(result.calls, value).toEqual([]);
		}
	});

	// CLI-79
	test("statuses rm maps --move-to", async () => {
		const result = await runCli(["statuses", "rm", "CDE", "blocked", "--move-to", "todo"], {
			"statuses.delete": { deleted: status().id, moved: 2 },
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.delete" });
		expect(result.calls[0]!.input).toEqual({ project: "CDE", status: "blocked", moveTo: "todo" });

		const inUse = await runCli(["statuses", "rm", "CDE", "blocked"], {
			"statuses.delete": rpcError("STATUS_IN_USE", { count: 2 }),
		});
		expect(inUse.code).toBe(4);
		expect(inUse.stderr).toEndWith(" (STATUS_IN_USE)\n");
	});

	test("statuses rm accepts the legacy force flag", async () => {
		const result = await runCli(["statuses", "rm", "CDE", "blocked", "--move-to", "done", "--force"], {
			"statuses.delete": { deleted: status().id, moved: 2 },
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ project: "CDE", status: "blocked", moveTo: "done", force: true });
	});

	// CLI-80
	test("statuses clear maps the project", async () => {
		const result = await runCli(["statuses", "clear", "CDE.web"], {
			"statuses.clear": { inheritedFrom: projectId, remapped: 3 },
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.clear", input: { project: "CDE.web" } });

		const root = await runCli(["statuses", "clear", "CDE"], { "statuses.clear": rpcError("ROOT_STATUSES") });
		expect(root.code).toBe(4);
		expect(root.stderr).toEndWith(" (ROOT_STATUSES)\n");
	});
});
