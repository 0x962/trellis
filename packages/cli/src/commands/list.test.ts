import { describe, expect, test } from "bun:test";
import { lines, makeDeps, runCli } from "../../test/deps.ts";
import { ticketPage } from "../../test/fixtures.ts";
import { run } from "../index.ts";

describe("list", () => {
	// CLI-86: the flags are the shared grammar one to one.
	test("list maps every grammar flag", async () => {
		const argv = [
			...["list", "--project", "CDE", "--subprojects", "false"],
			...["--status", "in-progress,agent-review", "--category", "started,review", "--reviewer", "human"],
			...["--priority", "high,urgent", "--parent", "none", "--pr", "open", "--ci", "fail,pending"],
			...["--actor", "agent:claude-code", "--q", "dark", "--sort", "-updatedAt"],
		];
		const result = await runCli(argv, { "tickets.list": { items: ticketPage(1), nextCursor: null } });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "tickets.list" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			subprojects: false,
			status: ["in-progress", "agent-review"],
			category: ["started", "review"],
			reviewer: "human",
			priority: ["high", "urgent"],
			parent: "none",
			pr: "open",
			ci: ["fail", "pending"],
			actor: "agent:claude-code",
			q: "dark",
			sort: "-updatedAt",
			limit: 50,
		});
	});

	// CLI-87
	test("list translates 24h and 30d into ISO bounds", async () => {
		const result = await runCli(
			["list", "--updated", "24h", "--created", "30d", "--completed", "2026-09-01T00:00:00Z"],
			{ "tickets.list": { items: [], nextCursor: null } },
			{ now: "2026-09-09T12:00:00Z" },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toMatchObject({
			updated: "2026-09-08T12:00:00.000Z",
			created: "2026-08-10T12:00:00.000Z",
			completed: "2026-09-01T00:00:00Z",
		});
	});

	// CLI-88
	test("list follows cursors up to --limit", async () => {
		const pages: Record<string, unknown> = {
			first: { items: ticketPage(100), nextCursor: "c1" },
			c1: { items: ticketPage(100, 100), nextCursor: "c2" },
			c2: { items: ticketPage(100, 200), nextCursor: null },
		};
		const result = await runCli(["list", "--limit", "120"], {
			"tickets.list": (input: { cursor?: string }) => pages[input.cursor ?? "first"],
		});
		expect(result.code).toBe(0);
		expect(result.calls).toHaveLength(2);
		expect(result.calls[0]!.input).toMatchObject({ limit: 120 });
		expect(result.calls[0]!.input).not.toHaveProperty("cursor");
		expect(result.calls[1]!.input).toMatchObject({ cursor: "c1" });
		expect(JSON.parse(result.stdout)).toHaveLength(120);
	});

	// CLI-89: page one is on stdout before the page two request arrives.
	test("list --all streams every page", async () => {
		const pages: Record<string, unknown> = {
			first: { items: ticketPage(2), nextCursor: "c1" },
			c1: { items: ticketPage(2, 2), nextCursor: "c2" },
			c2: { items: ticketPage(2, 4), nextCursor: null },
		};
		const stdoutAtRequest: string[] = [];
		let stdoutSoFar = () => "";
		const route = (input: { cursor?: string }) => {
			stdoutAtRequest.push(stdoutSoFar());
			return pages[input.cursor ?? "first"];
		};
		const harness = makeDeps({ "tickets.list": route });
		stdoutSoFar = harness.stdout;
		const code = await run(["list", "--all", "--jsonl"], harness.deps);
		expect(code).toBe(0);
		const calls = harness.server.calls;
		expect(calls).toHaveLength(3);
		for (const call of calls) expect(call.input).toMatchObject({ limit: 200 });
		expect(calls[1]!.input).toMatchObject({ cursor: "c1" });
		expect(calls[2]!.input).toMatchObject({ cursor: "c2" });
		expect(lines(harness.stdout()).map((line) => JSON.parse(line).identifier)).toEqual([
			"CDE-1",
			"CDE-2",
			"CDE-3",
			"CDE-4",
			"CDE-5",
			"CDE-6",
		]);
		expect(stdoutAtRequest[1]).toContain("CDE-1");
		expect(stdoutAtRequest[1]).toContain("CDE-2");
		expect(stdoutAtRequest[1]).not.toContain("CDE-3");
	});

	// CLI-90
	test("list defaults to 50 rows sorted by -updatedAt", async () => {
		const result = await runCli(
			["list"],
			{ "tickets.list": { items: ticketPage(2), nextCursor: null } },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls).toHaveLength(1);
		expect(result.calls[0]!.input).toMatchObject({ limit: 50, sort: "-updatedAt" });
		const [header, ...rows] = lines(result.stdout);
		expect(header!.trim().toLowerCase()).toStartWith("identifier");
		expect(rows.map((row) => row.split(/\s+/)[0])).toEqual(["CDE-1", "CDE-2"]);
	});
});
