import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { errors } from "@trellis/api";
import { exitCodeFor, formatError } from "../../../src/errors.ts";
import { lines, runCli } from "../../deps.ts";
import { rpcError } from "../../fakeServer.ts";
import { statusSummary, ticket } from "../../fixtures.ts";

// `exitCodeFor(code)` maps a contract error code to the process exit code.
// `formatError(error)` renders one ORPCError as the one stderr line
// `error: <message> (<CODE>)`.
const expected: Record<string, number> = {
	INPUT_VALIDATION_FAILED: 4,
	ACTOR_REQUIRED: 4,
	ACTOR_INVALID: 4,
	INVALID_CURSOR: 4,
	INVALID_PR_URL: 4,
	AGENT_CANNOT_COMPLETE: 4,
	AGENT_CANNOT_DELETE: 4,
	NOT_FOUND: 3,
	DUPLICATE: 4,
	COMMENT_HAS_REPLIES: 4,
	COMMENT_PARENT_MISMATCH: 4,
	KEY_LOCKED: 4,
	STATUS_NOT_IN_PROJECT: 4,
	STATUS_IN_USE: 4,
	LAST_STATUS: 4,
	ROOT_STATUSES: 4,
	STATUS_CATEGORY_IMMUTABLE: 4,
	CROSS_ROOT_MOVE: 4,
	PARENT_CYCLE: 4,
	PROJECT_NOT_EMPTY: 4,
	PROJECT_ARCHIVED: 4,
	INVALID_ANCHOR: 4,
	VERSION_CONFLICT: 4,
	PAYLOAD_TOO_LARGE: 4,
	GH_UNAVAILABLE: 6,
	CONCURRENCY_LIMIT: 4,
	RUNNER_UNAVAILABLE: 6,
};

const declared = (code: keyof typeof errors, data?: unknown, message = errors[code].message) =>
	new ORPCError(code, { defined: true, status: errors[code].status, message, data });

describe("exit codes", () => {
	// CLI-50: a code the contract adds without a row here fails the test.
	test("every contract error code maps to an exit code", () => {
		for (const code of Object.keys(errors)) {
			expect(expected, `${code} has no expected exit code`).toHaveProperty(code);
			expect(exitCodeFor(code), code).toBe(expected[code]!);
		}
	});

	// CLI-51
	test("an undefined server error exits 1", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR", { status: 500, message: "boom" });
		expect(exitCodeFor(error.code)).toBe(1);
	});
});

describe("the stderr line", () => {
	// CLI-52
	test("an error prints as one stderr line with the code in parentheses", () => {
		const line = formatError(declared("NOT_FOUND", { kind: "ticket", ref: "CDE-9" }));
		expect(line).toStartWith("error: ");
		expect(line).toEndWith(" (NOT_FOUND)");
		expect(line).not.toContain("\n");
		expect(line).toContain("ticket");
		expect(line).toContain("CDE-9");
	});

	// CLI-53
	test("STATUS_NOT_IN_PROJECT lists the valid names", () => {
		const valid = [
			statusSummary({ slug: "todo", name: "Todo", category: "todo" }),
			statusSummary(),
			statusSummary({ slug: "done", name: "Done", category: "done" }),
		];
		const line = formatError(declared("STATUS_NOT_IN_PROJECT", { valid }));
		expect(lines(line)).toHaveLength(1);
		expect(line).toEndWith(" (STATUS_NOT_IN_PROJECT)");
		for (const status of valid) {
			expect(line).toContain(status.name);
		}
	});

	// CLI-54
	test("VERSION_CONFLICT names the current version", () => {
		const line = formatError(declared("VERSION_CONFLICT", { current: ticket({ version: 7 }) }));
		expect(lines(line)).toHaveLength(1);
		expect(line).toMatch(/\b7\b/);
		expect(line).toEndWith(" (VERSION_CONFLICT)");
	});

	// CLI-55
	test("a multi-line message collapses to one line", () => {
		const line = formatError(
			declared("DUPLICATE", { field: "key" }, "A row with this value exists.\nPick another key."),
		);
		expect(line).not.toContain("\n");
		expect(line).toContain("A row with this value exists. Pick another key.");
	});

	// CLI-56
	test("an error under --json still goes to stderr only", async () => {
		const result = await runCli(["show", "CDE-9", "--json"], {
			"tickets.get": rpcError("NOT_FOUND", { kind: "ticket", ref: "CDE-9" }),
		});
		expect(result.code).toBe(3);
		expect(result.stdout).toBe("");
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toEndWith(" (NOT_FOUND)\n");
	});
});
