import { describe, expect, test } from "bun:test";
import { run } from "../../../src/index.ts";
import { type Format, printList, printRecord, ticketList, ticketRecord } from "../../../src/output.ts";
import { ansiPattern, stripAnsi } from "../../ansi.ts";
import { defaultEnv, lines, makeDeps, runCli } from "../../deps.ts";
import {
	attachment,
	attachmentId,
	commentId,
	commentId2,
	linkedPullRequest,
	prId,
	projectSummary,
	statusSet,
	ticket,
	ticketPage,
	ticketSummary,
	timeline,
} from "../../fixtures.ts";

// `Format` is `{ mode, color }`: `mode` is table (a TTY), json, jsonl, or
// quiet; `color` is false under --no-color and on a pipe. `printList` and
// `printRecord` take a writer `{ write(text) }`, the format, the rows, and a
// spec. `ticketList` names the table columns and the identifier of a
// TicketSummary. `ticketRecord` names the key/value fields of a Ticket.
const table: Format = { mode: "table", color: false };

const capture = () => {
	let text = "";
	const write = (chunk: string) => {
		text += chunk;
	};
	return { write, text: () => text };
};

const listPage = { items: [ticketSummary()], nextCursor: null };

describe("a TTY", () => {
	// CLI-40
	test("a TTY prints an aligned table with the identifier first", () => {
		const out = capture();
		const rows = [ticketSummary(), ticketSummary({ identifier: "CDE-7", number: 7, title: "Short", priority: "low" })];
		printList(out, table, rows, ticketList);
		const [header, ...body] = lines(out.text());
		const headers = header!.trim().split(/\s{2,}/);
		expect(headers.map((name) => name.toLowerCase())).toEqual(["identifier", "status", "priority", "title", "updated"]);
		expect(body).toHaveLength(2);
		const columnStart = (name: string) => header!.indexOf(name);
		for (const [index, row] of rows.entries()) {
			const line = body[index]!;
			expect(line.indexOf(row.identifier)).toBe(0);
			expect(line.slice(columnStart(headers[2]!))).toStartWith(row.priority);
			expect(line.slice(columnStart(headers[3]!))).toStartWith(row.title);
		}
	});

	// CLI-41
	test("a TTY prints a key/value block for one record", () => {
		const out = capture();
		printRecord(out, table, ticket(), ticketRecord);
		const block = lines(out.text());
		expect(block.length).toBeGreaterThan(3);
		expect(block[0]).toStartWith("identifier");
		expect(block[0]).toContain("CDE-42");
		const valueColumns = new Set<number>();
		for (const line of block) {
			const match = /^([A-Za-z]+):( +)(\S.*)$/.exec(line);
			expect(match, line).not.toBeNull();
			valueColumns.add(match![1]!.length + 1 + match![2]!.length);
		}
		expect(valueColumns.size).toBe(1);
	});
});

describe("json", () => {
	// CLI-42
	test("a non-TTY prints JSON", async () => {
		const piped = await runCli(["show", "CDE-42"], { "tickets.get": ticket() }, { tty: false });
		const flagged = await runCli(["show", "CDE-42", "--json"], { "tickets.get": ticket() }, { tty: true });
		expect(piped.stdout).toBe(flagged.stdout);
		expect(JSON.parse(piped.stdout)).toEqual(ticket());
	});

	// CLI-43
	test("--json prints the procedure output", async () => {
		const result = await runCli(["show", "CDE-42", "--json"], { "tickets.get": ticket() }, { tty: true });
		expect(result.stdout).toBe(`${JSON.stringify(ticket())}\n`);
	});

	// CLI-44
	test("--json prints a list as one array", async () => {
		const pages: Record<string, unknown> = {
			first: { items: ticketPage(50), nextCursor: "c1" },
			c1: { items: ticketPage(50, 50), nextCursor: null },
		};
		const result = await runCli(
			["list", "--json", "--limit", "100"],
			{ "tickets.list": (input: { cursor?: string }) => pages[input.cursor ?? "first"] },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(100);
		expect(result.stdout).not.toContain("nextCursor");
	});

	// CLI-44: the array streams. Each page reaches stdout before the request
	// for the page after it, so a long list prints while it loads.
	test("--json writes every page before the next request", async () => {
		const pages: Record<string, unknown> = {
			first: { items: ticketPage(2), nextCursor: "c1" },
			c1: { items: ticketPage(2, 2), nextCursor: null },
		};
		const printedAtRequest: string[] = [];
		let printed = () => "";
		const harness = makeDeps({
			"tickets.list": (input: { cursor?: string }) => {
				printedAtRequest.push(printed());
				return pages[input.cursor ?? "first"];
			},
		});
		printed = harness.stdout;
		const code = await run(["list", "--all"], harness.deps);
		expect(code).toBe(0);
		expect(printedAtRequest[0]).toBe("");
		expect(printedAtRequest[1]).toStartWith("[");
		expect(JSON.parse(harness.stdout())).toHaveLength(4);
	});

	// CLI-45
	test("--jsonl prints one object per line", async () => {
		const result = await runCli(["list", "--jsonl"], { "tickets.list": { items: ticketPage(3), nextCursor: null } });
		const rows = lines(result.stdout);
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => JSON.parse(row).identifier)).toEqual(["CDE-1", "CDE-2", "CDE-3"]);
	});

	// CLI-46
	test("--jsonl prints one line for one record", async () => {
		const result = await runCli(["show", "CDE-42", "--jsonl"], { "tickets.get": ticket() });
		expect(lines(result.stdout)).toHaveLength(1);
		expect(JSON.parse(result.stdout)).toEqual(ticket());
	});
});

describe("quiet", () => {
	// CLI-47
	test("--quiet prints exactly one identifier per line", async () => {
		const cases: Array<[string[], Record<string, unknown>, string[]]> = [
			[["list"], { "tickets.list": { items: ticketPage(2), nextCursor: null } }, ["CDE-1", "CDE-2"]],
			[["show", "CDE-42"], { "tickets.get": ticket() }, ["CDE-42"]],
			[["create", "-p", "CDE", "-t", "Dark mode"], { "tickets.create": ticket() }, ["CDE-42"]],
			[
				["projects", "list"],
				{ "projects.list": [projectSummary(), projectSummary({ path: "CDE.web" })] },
				["CDE", "CDE.web"],
			],
			[["statuses", "list", "CDE"], { "statuses.list": statusSet() }, ["todo", "in-progress", "blocked"]],
			[["comments", "CDE-42"], { "timeline.list": timeline() }, [commentId2, commentId]],
			[["attachments", "CDE-42"], { "attachments.list": [attachment()] }, [attachmentId]],
			[["pr", "list", "CDE-42"], { "pullRequests.list": [linkedPullRequest()] }, [prId]],
		];
		for (const [argv, routes, expected] of cases) {
			const result = await runCli([...argv, "--quiet"], routes, { tty: true });
			expect(result.code, argv.join(" ")).toBe(0);
			expect(lines(result.stdout), argv.join(" ")).toEqual(expected);
		}
	});

	// CLI-48
	test("--quiet wins over --json", async () => {
		const result = await runCli(["list", "--quiet", "--json"], { "tickets.list": listPage });
		expect(result.stdout).toBe("CDE-42\n");
	});
});

describe("color", () => {
	// CLI-49: a heading is the one place a TTY gets an escape sequence, so
	// `show --prs` on a TTY proves the flag, the pipe, and NO_COLOR each strip it.
	test("--no-color and a pipe strip ANSI escapes", async () => {
		const noColor = await runCli(["show", "CDE-42", "--no-color"], { "tickets.get": ticket() }, { tty: true });
		expect(noColor.stdout).not.toMatch(ansiPattern);
		const piped = await runCli(["list"], { "tickets.list": listPage }, { tty: false });
		expect(piped.stdout).not.toMatch(ansiPattern);

		const argv = ["show", "CDE-42", "--prs"];
		const routes = { "tickets.get": ticket() };
		const colored = await runCli(argv, routes, { tty: true });
		expect(colored.stdout).toMatch(ansiPattern);
		const flagged = await runCli([...argv, "--no-color"], routes, { tty: true });
		expect(flagged.stdout).not.toMatch(ansiPattern);
		expect(flagged.stdout).toBe(stripAnsi(colored.stdout));
		const pipedHeading = await runCli(argv, routes, { tty: false });
		expect(pipedHeading.stdout).not.toMatch(ansiPattern);
		const env = await runCli(argv, routes, { tty: true, env: { ...defaultEnv, NO_COLOR: "1" } });
		expect(env.stdout).not.toMatch(ansiPattern);
	});
});
