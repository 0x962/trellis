import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { inbox } from "../../../fixtures.ts";

describe("inbox", () => {
	// CLI-111
	test("inbox maps the project and prints four sections", async () => {
		const result = await runCli(["inbox", "--project", "CDE"], { "inbox.get": inbox() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "inbox.get", input: { project: "CDE" } });
		const sections: Array<[string, number]> = [
			["review", 1],
			["failingCi", 1],
			["stalled", 0],
			["doneByAgentsToday", 5],
		];
		let previous = -1;
		for (const [name, total] of sections) {
			const line = lines(result.stdout).find((candidate) => candidate.includes(name));
			expect(line, name).toBeDefined();
			expect(line, name).toMatch(new RegExp(`\\b${total}\\b`));
			const position = result.stdout.indexOf(name);
			expect(position, name).toBeGreaterThan(previous);
			previous = position;
		}

		const quiet = await runCli(["inbox", "--project", "CDE", "--quiet"], { "inbox.get": inbox() });
		expect(lines(quiet.stdout)).toEqual(["CDE-42", "CDE-43", "CDE-44"]);
	});
});
