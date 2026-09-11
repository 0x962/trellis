import { describe, expect, test } from "bun:test";
import { rolePrompt } from "@trellis/api";
import { lines, runCli } from "../../test/deps.ts";
import { statusSet } from "../../test/fixtures.ts";

const pr = "https://github.com/o/r/pull/7";

// The set the server answers, with one written description and two empty ones.
const described = () => ({
	...statusSet(),
	statuses: statusSet().statuses.map((row, index) => ({
		...row,
		description: index === 0 ? "New work. Start a builder." : "",
	})),
});

describe("instructions --role", () => {
	test("manager with a project reads the statuses and prints the manager prompt with them", async () => {
		const result = await runCli(["instructions", "--role", "manager", "--project", "CDE"], {
			"statuses.list": described(),
		});
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => [call.path, call.input])).toEqual([["statuses.list", { project: "CDE" }]]);
		expect(result.stdout).toBe(rolePrompt({ role: "manager", project: "CDE", statuses: described().statuses }));
		expect(result.stdout).toContain("New work. Start a builder.");
	});

	test("manager without a project prints the prompt for KEY and sends nothing", async () => {
		const result = await runCli(["instructions", "--role", "manager"]);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.stdout).toBe(rolePrompt({ role: "manager", project: "KEY", statuses: null }));
	});

	test("builder prints the builder prompt for the ticket and sends nothing", async () => {
		const result = await runCli(["instructions", "--role", "builder", "--project", "CDE", "--ticket", "CDE-42"]);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.stdout).toBe(rolePrompt({ role: "builder", project: "CDE", ticket: "CDE-42" }));
	});

	test("reviewer prints the reviewer prompt for the ticket and the PR", async () => {
		const argv = ["instructions", "--role", "reviewer", "--project", "CDE", "--ticket", "CDE-42", "--pr", pr];
		const result = await runCli(argv);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.stdout).toBe(rolePrompt({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl: pr }));
	});

	test("a missing --ticket, a missing --pr, an unknown role, or a role flag without --role exits 2", async () => {
		// The stderr line names what is wrong: the missing flag, the unknown
		// role, or the --role flag the other flags need.
		for (const [argv, names] of [
			[["instructions", "--role", "builder", "--project", "CDE"], "--ticket"],
			[["instructions", "--role", "reviewer", "--project", "CDE", "--ticket", "CDE-42"], "--pr"],
			[["instructions", "--role", "janitor"], "janitor"],
			[["instructions", "--ticket", "CDE-42"], "--role"],
			[["instructions", "--pr", pr], "--role"],
		] as const) {
			const result = await runCli([...argv]);
			expect(result.code, argv.join(" ")).toBe(2);
			expect(lines(result.stderr), argv.join(" ")).toHaveLength(1);
			expect(result.stderr, argv.join(" ")).toContain(names);
			expect(result.stdout, argv.join(" ")).toBe("");
			expect(result.calls, argv.join(" ")).toEqual([]);
		}
	});
});
