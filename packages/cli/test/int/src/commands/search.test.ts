import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { projectSummary, ticketSummary } from "../../../fixtures.ts";

const answer = () => ({
	tickets: [ticketSummary(), ticketSummary({ identifier: "CDE-7", number: 7, title: "Dark mode toggle" })],
	projects: [projectSummary({ path: "CDE.web", slug: "web", name: "Web" })],
});

describe("search", () => {
	// CLI-107
	test("search maps q, project, and limit", async () => {
		const result = await runCli(["search", "dark mode", "--project", "CDE", "--limit", "5"], {
			"search.query": answer(),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "search.query" });
		expect(result.calls[0]!.input).toEqual({ q: "dark mode", project: "CDE", limit: 5 });

		const tty = await runCli(["search", "dark mode"], { "search.query": answer() }, { tty: true });
		expect(tty.stdout.indexOf("CDE-42")).toBeGreaterThanOrEqual(0);
		expect(tty.stdout.indexOf("CDE-7")).toBeGreaterThan(tty.stdout.indexOf("CDE-42"));
		expect(tty.stdout.indexOf("CDE.web")).toBeGreaterThan(tty.stdout.indexOf("CDE-7"));

		const quiet = await runCli(["search", "dark mode", "--quiet"], { "search.query": answer() });
		expect(lines(quiet.stdout)).toEqual(["CDE-42", "CDE-7", "CDE.web"]);
	});
});
