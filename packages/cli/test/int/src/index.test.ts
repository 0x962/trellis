import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { originDir } from "../../../../../test/originDir.ts";
import type { Deps } from "../../../src/index.ts";
import { main } from "../../../src/index.ts";
import { lines, runCli } from "../../deps.ts";
import { rpcError } from "../../fakeServer.ts";
import { comment, statusSummary, ticket, ticketSummary } from "../../fixtures.ts";

const verbs = [
	"doctor",
	"evidence",
	"gateway",
	"projects",
	"statuses",
	"personas",
	"agents",
	"manager",
	"create",
	"show",
	"list",
	"edit",
	"move",
	"comment",
	"comments",
	"thread",
	"attach",
	"attachments",
	"pr",
	"review",
	"sub",
	"delete",
	"search",
	"activity",
	"brief",
	"watch",
	"open",
	"whoami",
	"instructions",
	"status",
	"logs",
	"serve",
	"install",
	"uninstall",
	"backup",
	"restore",
	"export",
];

const listPage = { items: [ticketSummary()], nextCursor: null };

describe("the root command", () => {
	// CLI-06
	test("subCommands are lazy imports", () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(Object.keys(subCommands).sort()).toEqual([...verbs].sort());
		for (const [verb, entry] of Object.entries(subCommands)) {
			expect(typeof entry, verb).toBe("function");
		}
	});

	// CLI-07
	test("an unknown verb exits 2 with one stderr line and no request", async () => {
		const result = await runCli(["frobnicate"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.calls).toEqual([]);
	});

	// CLI-08
	test("a missing required flag exits 2 before any request", async () => {
		const result = await runCli(["create", "-p", "CDE"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr.toLowerCase()).toContain("title");
		expect(result.calls).toEqual([]);
	});

	// CLI-08: a flag the command does not declare is a usage error, so a
	// mistyped filter never widens a query to the whole backlog.
	test("an unknown flag exits 2 with one stderr line and no request", async () => {
		const cases = [
			["list", "-p", "CDE"],
			["list", "--stauts", "todo"],
			["list", "--statis=todo"],
			["show", "CDE-42", "--prz"],
			["projects", "list", "--nope"],
		];
		for (const argv of cases) {
			const result = await runCli(argv, { "tickets.list": listPage, "tickets.get": ticket(), "projects.list": [] });
			expect(result.code, argv.join(" ")).toBe(2);
			expect(lines(result.stderr), argv.join(" ")).toHaveLength(1);
			expect(result.stderr, argv.join(" ")).toContain(argv.find((arg) => arg.startsWith("-"))!.split("=")[0]!);
			expect(result.calls, argv.join(" ")).toEqual([]);
		}
	});

	// CLI-08: a declared alias, a negated boolean, a value that starts with a
	// dash, and everything after `--` pass the check.
	test("declared flags, negations, dashed values, and -- pass the flag check", async () => {
		const create = await runCli(["create", "-p", "CDE", "-t", "-dark-", "-d", "-"], { "tickets.create": ticket() });
		expect(create.code).toBe(0);
		expect(create.calls[0]!.input).toMatchObject({ project: "CDE", title: "-dark-", description: "" });
		const negated = await runCli(["list", "--no-all"], { "tickets.list": listPage });
		expect(negated.code).toBe(0);
		const stopped = await runCli(["comment", "CDE-42", "--body", "hi", "--", "--x"], { "comments.create": comment() });
		expect(stopped.code).toBe(0);
		expect(stopped.calls[0]!.input).toMatchObject({ ticket: "CDE-42", body: "hi" });
	});

	// CLI-09: `--as` and `--url` take one value. Either flag at the end of
	// the line has none, so the run is a usage error and no request goes out.
	test("a trailing --as or --url exits 2 before any request", async () => {
		for (const argv of [
			["edit", "CDE-42", "--description", "--as"],
			["show", "CDE-42", "--url"],
			["list", "--as"],
		]) {
			const result = await runCli(argv, {
				"tickets.update": ticket(),
				"tickets.get": ticket(),
				"tickets.list": listPage,
			});
			expect(result.code, argv.join(" ")).toBe(2);
			expect(lines(result.stderr), argv.join(" ")).toHaveLength(1);
			expect(result.calls, argv.join(" ")).toEqual([]);
		}
	});

	// CLI-08: a flag that takes a value and stands at the end of the line has
	// none. The run stops before the request, so `edit --description` never
	// writes an empty description over a written one.
	test("a flag without its value exits 2 before any request", async () => {
		for (const argv of [
			["edit", "CDE-42", "--description"],
			["list", "--project"],
			["statuses", "edit", "CDE", "blocked", "--name"],
		]) {
			const result = await runCli(argv, {
				"tickets.update": ticket(),
				"tickets.list": listPage,
				"statuses.update": statusSummary(),
			});
			expect(result.code, argv.join(" ")).toBe(2);
			expect(lines(result.stderr), argv.join(" ")).toHaveLength(1);
			expect(result.calls, argv.join(" ")).toEqual([]);
		}
	});

	// CLI-09: `--` ends the global flags. Every token after it is a value or
	// a positional, so `search -- --help` searches for the text `--help`.
	test("-- ends the global flags", async () => {
		const result = await runCli(["search", "--", "--help"], { "search.query": { tickets: [], projects: [] } });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "search.query", input: { q: "--help" } });
	});

	// CLI-09: a global flag spelling that follows a flag of the command is
	// that flag's value, so the comment carries the text `--help`.
	test("a global flag spelling passes through as the value of a command flag", async () => {
		const result = await runCli(["comment", "CDE-42", "--body", "--help"], { "comments.create": comment() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "comments.create", input: { ticket: "CDE-42", body: "--help" } });
	});

	// CLI-09
	test("global flags work before and after the verb", async () => {
		const before = await runCli(["--json", "list", "--project", "CDE"], { "tickets.list": listPage }, { tty: true });
		const after = await runCli(["list", "--project", "CDE", "--json"], { "tickets.list": listPage }, { tty: true });
		expect(before.code).toBe(0);
		expect(after.code).toBe(0);
		expect(before.calls[0]!.input).toEqual(after.calls[0]!.input);
		expect(JSON.parse(before.stdout)).toEqual([ticketSummary()]);
		expect(after.stdout).toBe(before.stdout);
	});
});

describe("the server url", () => {
	// CLI-10
	test("the default server URL is http://127.0.0.1:4521", async () => {
		const result = await runCli(["show", "CDE-1"], { "tickets.get": ticket() });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.request.url).toStartWith("http://127.0.0.1:4521/rpc/");
	});

	// CLI-11
	test("TRELLIS_URL overrides the default URL", async () => {
		const result = await runCli(
			["show", "CDE-1"],
			{ "tickets.get": ticket() },
			{ env: { CLAUDECODE: "1", TRELLIS_URL: "http://10.0.0.5:9000" } },
		);
		expect(result.calls[0]!.request.url).toStartWith("http://10.0.0.5:9000/rpc/");
	});

	// CLI-12
	test("--url beats TRELLIS_URL", async () => {
		const result = await runCli(
			["show", "CDE-1", "--url", "http://localhost:4522"],
			{ "tickets.get": ticket() },
			{ env: { CLAUDECODE: "1", TRELLIS_URL: "http://10.0.0.5:9000" } },
		);
		expect(result.calls[0]!.request.url).toStartWith("http://localhost:4522/rpc/");
	});
});

describe("exit codes", () => {
	// CLI-14: 0 ok, 1 server error, 2 usage, 3 not found, 4 refused or
	// conflict, 5 unreachable, 6 gh unavailable, 7 client too old.
	test("run returns the mapped exit code for a procedure error", async () => {
		const result = await runCli(["show", "CDE-9"], {
			"tickets.get": rpcError("NOT_FOUND", { kind: "ticket", ref: "CDE-9" }),
		});
		expect(result.code).toBe(3);
		expect(lines(result.stderr)).toHaveLength(1);
	});

	// CLI-14: every request carries the abort signal, so one interrupt ends a
	// verb whose answer never arrives. The run exits 130 and prints nothing.
	test("one interrupt stops a verb whose request hangs", async () => {
		const controller = new AbortController();
		const hang: Deps["fetch"] = (_request, init) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
				setTimeout(() => controller.abort(), 5);
			});
		const running = runCli(["show", "CDE-1"], {}, { fetch: hang, signal: controller.signal });
		void running.catch(() => {});
		const outcome = await Promise.race([running, Bun.sleep(500).then(() => "still running" as const)]);
		expect(outcome).toMatchObject({ code: 130, stdout: "", stderr: "" });
	});

	// CLI-14: the entrypoint hands the value of `run` to process.exit. Port 1
	// refuses every connection, so the process exits with the unreachable code.
	test("the process exits with the value run returns", () => {
		const result = Bun.spawnSync(["bun", "src/index.ts", "show", "CDE-1", "--url", "http://127.0.0.1:1"], {
			cwd: join(originDir(import.meta.dir), ".."),
			env: { ...process.env, TRELLIS_ACTOR: "agent:test" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(5);
		expect(lines(result.stderr.toString())).toHaveLength(1);
	});
});
