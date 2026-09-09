import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { rpcError } from "../../test/fakeServer.ts";
import { projectId, status, statusSet } from "../../test/fixtures.ts";

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

	// CLI-75
	test("statuses add maps every flag", async () => {
		const argv = [
			...["statuses", "add", "CDE", "Blocked"],
			...["--category", "started", "--reviewer", "agent", "--color", "#ff0000", "--position", "2", "--default"],
		];
		const result = await runCli(argv, { "statuses.create": status({ slug: "blocked", name: "Blocked" }) });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.create" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			name: "Blocked",
			category: "started",
			reviewer: "agent",
			color: "#ff0000",
			position: 2,
			isDefault: true,
		});
	});

	// CLI-76
	test("statuses edit maps its flags", async () => {
		const argv = [
			...["statuses", "edit", "CDE", "blocked"],
			...["--name", "Stuck", "--color", "#00ff00", "--reviewer", "human", "--default"],
		];
		const result = await runCli(argv, { "statuses.update": status({ slug: "stuck", name: "Stuck" }) });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "statuses.update" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			status: "blocked",
			name: "Stuck",
			color: "#00ff00",
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
