import { describe, expect, test } from "bun:test";
import { CheckSchema } from "@trellis/api";
import {
	bucketForCheckRun,
	bucketForStatusContext,
	deriveCiState,
	findTicketIdentifiers,
	normalizeChecks,
	TICKET_IDENTIFIER_PATTERN,
} from "./parse.ts";

// The raw nodes below are the shapes `gh api graphql` returns for the
// contexts(first: 100) selection in graphql.ts, discriminated by __typename.
const checkRun = (name: string, status: string, conclusion: string | null, workflow: string | null = "ci") => ({
	__typename: "CheckRun" as const,
	name,
	status,
	conclusion,
	detailsUrl: `https://ci/${name}`,
	checkSuite: { workflowRun: workflow === null ? null : { workflow: { name: workflow } } },
});
const statusContext = (context: string, state: string, targetUrl: string | null = "https://status") => ({
	__typename: "StatusContext" as const,
	context,
	state,
	targetUrl,
});
const check = (bucket: string) =>
	({ name: bucket, workflow: null, bucket, link: null }) as Parameters<typeof deriveCiState>[0][number];
const checks = (...buckets: string[]) => buckets.map(check);

describe("check buckets", () => {
	test("maps CheckRun conclusions to buckets", () => {
		const conclusions = ["SUCCESS", "FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "CANCELLED", "SKIPPED", "NEUTRAL"];
		const buckets = conclusions.map((conclusion) => bucketForCheckRun(checkRun("x", "COMPLETED", conclusion)));
		expect(buckets).toEqual(["pass", "fail", "fail", "fail", "cancel", "skipping", "skipping"]);
	});

	test("maps an unfinished CheckRun status to pending", () => {
		for (const status of ["QUEUED", "IN_PROGRESS", "WAITING", "PENDING", "REQUESTED"]) {
			expect(bucketForCheckRun(checkRun("x", status, null)), status).toBe("pending");
		}
	});

	test("maps StatusContext states to buckets", () => {
		const states = ["SUCCESS", "FAILURE", "ERROR", "PENDING", "EXPECTED"];
		expect(states.map((state) => bucketForStatusContext(statusContext("x", state)))).toEqual([
			"pass",
			"fail",
			"fail",
			"pending",
			"pending",
		]);
	});

	test("normalizeChecks returns CheckSchema rows sorted by workflow then name", () => {
		const normalized = normalizeChecks([
			checkRun("test", "COMPLETED", "SUCCESS", "ci"),
			statusContext("license/cla", "SUCCESS", null),
			checkRun("build", "IN_PROGRESS", null, "ci"),
			{ ...checkRun("lint", "COMPLETED", "FAILURE", null), detailsUrl: null },
			checkRun("a", "COMPLETED", "CANCELLED", "deploy"),
		]);
		expect(normalized).toEqual([
			{ name: "license/cla", workflow: null, bucket: "pass", link: null },
			{ name: "lint", workflow: null, bucket: "fail", link: null },
			{ name: "build", workflow: "ci", bucket: "pending", link: "https://ci/build" },
			{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/test" },
			{ name: "a", workflow: "deploy", bucket: "cancel", link: "https://ci/a" },
		]);
		for (const row of normalized) {
			expect(CheckSchema.safeParse(row).success, row.name).toBe(true);
		}
	});
});

describe("deriveCiState", () => {
	test("deriveCiState: no checks is none", () => {
		expect(deriveCiState([])).toBe("none");
	});

	test("deriveCiState: all pass is pass", () => {
		expect(deriveCiState(checks("pass", "pass"))).toBe("pass");
	});

	test("deriveCiState: skipping counts as nothing", () => {
		expect(deriveCiState(checks("skipping"))).toBe("none");
		expect(deriveCiState(checks("skipping", "pass"))).toBe("pass");
	});

	test("deriveCiState: any pending beats pass", () => {
		expect(deriveCiState(checks("pass", "pending"))).toBe("pending");
	});

	test("deriveCiState: any fail beats pending", () => {
		expect(deriveCiState(checks("pending", "fail", "pass"))).toBe("fail");
	});

	test("deriveCiState: cancel counts as fail", () => {
		expect(deriveCiState(checks("cancel", "pass", "pending"))).toBe("fail");
	});
});

describe("findTicketIdentifiers", () => {
	test("auto-link regex matches a lowercase branch name and uppercases the key", () => {
		expect(findTicketIdentifiers("cde-42-slug")).toEqual([{ key: "CDE", number: 42 }]);
	});

	test("auto-link regex matches uppercase identifiers inside a title", () => {
		expect(findTicketIdentifiers("Fix CDE-42 login and see AB1-7")).toEqual([
			{ key: "CDE", number: 42 },
			{ key: "AB1", number: 7 },
		]);
	});

	test("auto-link deduplicates the same identifier in different cases", () => {
		expect(findTicketIdentifiers("CDE-42 cde-42 Cde-42")).toEqual([{ key: "CDE", number: 42 }]);
	});

	test("auto-link drops number zero", () => {
		expect(findTicketIdentifiers("ABC-0-x")).toEqual([]);
	});

	test("auto-link regex rejects keys outside the grammar and unbounded numbers", () => {
		for (const text of ["a-1", "abcdefghijk-1", "1ab-2", "cde-42abc", "cde_42"]) {
			expect(findTicketIdentifiers(text), text).toEqual([]);
		}
	});

	test("auto-link matches after a path separator and parses leading zeros as an integer", () => {
		expect(findTicketIdentifiers("feat/cde-42-login")).toEqual([{ key: "CDE", number: 42 }]);
		expect(findTicketIdentifiers("Closes CDE-007.")).toEqual([{ key: "CDE", number: 7 }]);
	});

	test("auto-link regex is the plan's pattern and is safe to call twice", () => {
		expect(TICKET_IDENTIFIER_PATTERN.source).toBe("\\b([a-z][a-z0-9]{1,9})-(\\d+)\\b");
		expect(TICKET_IDENTIFIER_PATTERN.flags).toBe("gi");
		const text = "CDE-1 and cde-2";
		const first = findTicketIdentifiers(text);
		expect(findTicketIdentifiers(text)).toEqual(first);
		expect(first).toHaveLength(2);
	});
});
