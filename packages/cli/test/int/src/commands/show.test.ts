import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { linkedPullRequest, ticket, timeline } from "../../../fixtures.ts";

const withDescription = () => ticket({ description: "Line one of the body\nLine two" });

describe("show", () => {
	// CLI-83
	test("show maps the ref", async () => {
		const result = await runCli(["show", "CDE-42"], { "tickets.get": withDescription() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls).toHaveLength(1);
		expect(result.calls[0]).toMatchObject({ path: "tickets.get", input: { ticket: "CDE-42" } });
		const block = lines(result.stdout);
		expect(block[0]).toStartWith("identifier");
		expect(block[0]).toContain("CDE-42");
		const descriptionAt = result.stdout.indexOf("Line one of the body");
		expect(descriptionAt).toBeGreaterThan(result.stdout.indexOf("CDE-42"));
		expect(result.stdout).toContain("Line two");

		const json = await runCli(["show", "CDE-42", "--json"], { "tickets.get": withDescription() });
		expect(JSON.parse(json.stdout)).toEqual(withDescription());
	});

	// CLI-84
	test("show --comments and --activity fetch the timeline", async () => {
		const routes = { "tickets.get": ticket(), "timeline.list": timeline() };
		const comments = await runCli(["show", "CDE-42", "--comments"], routes, { tty: true });
		expect(comments.code).toBe(0);
		expect(comments.calls.map((call) => call.path)).toEqual(["tickets.get", "timeline.list"]);
		expect(comments.calls[1]!.input).toEqual({ ticket: "CDE-42" });
		expect(comments.stdout).toContain("Body A");
		expect(comments.stdout).toContain("Body B");
		expect(comments.stdout).not.toContain("human-review");

		const activity = await runCli(["show", "CDE-42", "--activity"], routes, { tty: true });
		expect(activity.stdout).toContain("human-review");
		expect(activity.stdout).not.toContain("Body A");

		const both = await runCli(["show", "CDE-42", "--comments", "--activity"], routes, { tty: true });
		expect(both.calls).toHaveLength(2);
		expect(both.stdout).toContain("Body A");
		expect(both.stdout).toContain("human-review");

		const json = await runCli(["show", "CDE-42", "--comments", "--activity", "--json"], routes);
		expect(JSON.parse(json.stdout)).toEqual({ ticket: ticket(), timeline: timeline() });
	});

	// CLI-85
	test("show --prs prints the linked PRs", async () => {
		const pr = linkedPullRequest({ state: "merged", ciState: "fail" });
		const result = await runCli(["show", "CDE-42", "--prs"], { "tickets.get": ticket({ prs: [pr] }) }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["tickets.get"]);
		expect(result.stdout).toContain("merged");
		expect(result.stdout).toContain("fail");
		expect(result.stdout).toContain("https://github.com/o/r/pull/7");
	});
});
