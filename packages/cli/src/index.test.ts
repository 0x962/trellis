import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { lines, runCli } from "../test/deps.ts";
import { rpcError } from "../test/fakeServer.ts";
import { ticket, ticketSummary } from "../test/fixtures.ts";
import { main } from "./index.ts";

const verbs = [
	"projects",
	"statuses",
	"create",
	"show",
	"list",
	"edit",
	"move",
	"comment",
	"comments",
	"attach",
	"attachments",
	"pr",
	"sub",
	"delete",
	"search",
	"activity",
	"brief",
	"inbox",
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
	// CLI-13
	test("the server-process verbs are stubs that print not yet", async () => {
		for (const verb of ["install", "uninstall", "serve", "backup", "restore", "logs"]) {
			const result = await runCli([verb]);
			expect(result.code, verb).toBe(0);
			expect(result.stdout, verb).toBe(`${verb}: not yet\n`);
			expect(result.calls, verb).toEqual([]);
		}
	});

	// CLI-14: 0 ok, 1 server error, 2 usage, 3 not found, 4 refused or
	// conflict, 5 unreachable, 6 gh unavailable, 7 client too old.
	test("run returns the mapped exit code for a procedure error", async () => {
		const result = await runCli(["show", "CDE-9"], {
			"tickets.get": rpcError("NOT_FOUND", { kind: "ticket", ref: "CDE-9" }),
		});
		expect(result.code).toBe(3);
		expect(lines(result.stderr)).toHaveLength(1);
	});

	// CLI-14: the entrypoint hands the value of `run` to process.exit. Port 1
	// refuses every connection, so the process exits with the unreachable code.
	test("the process exits with the value run returns", () => {
		const result = Bun.spawnSync(["bun", "src/index.ts", "show", "CDE-1", "--url", "http://127.0.0.1:1"], {
			cwd: join(import.meta.dir, ".."),
			env: { ...process.env, TRELLIS_ACTOR: "agent:test" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(5);
		expect(lines(result.stderr.toString())).toHaveLength(1);
	});
});
