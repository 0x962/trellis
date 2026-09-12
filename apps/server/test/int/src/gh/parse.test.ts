import { describe, expect, test } from "bun:test";
import { CheckSchema } from "@trellis/api";
import {
	bucketForCheckRun,
	bucketForStatusContext,
	deriveCiState,
	findTicketIdentifiers,
	normalizeChecks,
	TICKET_IDENTIFIER_PATTERN,
} from "../../../../src/gh/parse.ts";

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

	test("normalizeChecks gives a null link when the raw node omits its URL field", () => {
		const { detailsUrl: _detailsUrl, ...runWithoutUrl } = checkRun("build", "COMPLETED", "SUCCESS");
		const { targetUrl: _targetUrl, ...contextWithoutUrl } = statusContext("license/cla", "SUCCESS");
		const normalized = normalizeChecks([runWithoutUrl, contextWithoutUrl]);
		expect(normalized).toEqual([
			{ name: "license/cla", workflow: null, bucket: "pass", link: null },
			{ name: "build", workflow: "ci", bucket: "pass", link: null },
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

	// tickets.number is a Postgres int, so a number above 2147483647 names no
	// ticket, and an equality lookup with that value errors in Postgres. A
	// timestamp stamp such as run-1757400000000 must not reach the lookup.
	test("auto-link drops a number above the Postgres int range", () => {
		expect(findTicketIdentifiers("cde-2147483647")).toEqual([{ key: "CDE", number: 2147483647 }]);
		for (const text of [
			"backup-2147483648",
			"run-1757400000000",
			"Deploy build-20260909120000 to prod",
			"CDE-9007199254740993",
			`CDE-${"9".repeat(309)}`,
		]) {
			expect(findTicketIdentifiers(text), text).toEqual([]);
		}
		expect(findTicketIdentifiers("run-1757400000000 fixes CDE-42")).toEqual([{ key: "CDE", number: 42 }]);
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

	test("auto-link finds every identifier after an outside exec moved the regex's lastIndex", () => {
		TICKET_IDENTIFIER_PATTERN.exec("CDE-42");
		expect(TICKET_IDENTIFIER_PATTERN.lastIndex).toBe(6);
		expect(findTicketIdentifiers("CDE-42")).toEqual([{ key: "CDE", number: 42 }]);
		TICKET_IDENTIFIER_PATTERN.exec("CDE-42 and cde-7");
		expect(findTicketIdentifiers("CDE-42 and cde-7")).toEqual([
			{ key: "CDE", number: 42 },
			{ key: "CDE", number: 7 },
		]);
	});
});

// GitHub keeps a re-run beside the run it replaces on the same commit, so
// contexts holds two nodes with one name. `gh pr checks` keys a CheckRun on
// name, workflow, and event, keys a StatusContext on its context name, and
// keeps the node with the latest start time. trellis keeps the same node, so
// a failed first run does not hold ci_state at fail after the re-run passes.
describe("duplicate contexts", () => {
	const run = (
		name: string,
		conclusion: string,
		startedAt: string,
		options: { workflow?: string; event?: string; url?: string } = {},
	) => ({
		__typename: "CheckRun" as const,
		name,
		status: "COMPLETED",
		conclusion,
		startedAt,
		detailsUrl: options.url ?? `https://ci/${name}`,
		checkSuite: {
			workflowRun: { event: options.event ?? "pull_request", workflow: { name: options.workflow ?? "ci" } },
		},
	});
	const context = (state: string, createdAt: string, targetUrl: string) => ({
		__typename: "StatusContext" as const,
		context: "license/cla",
		state,
		createdAt,
		targetUrl,
	});
	const failed = run("test", "FAILURE", "2026-09-07T06:55:14Z", { url: "https://ci/run/1" });
	const passed = run("test", "SUCCESS", "2026-09-07T07:40:41Z", { url: "https://ci/run/2" });

	test("keeps the newest of two runs with one name, workflow, and event", () => {
		const normalized = normalizeChecks([failed, passed]);
		expect(normalized).toEqual([{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/run/2" }]);
		expect(deriveCiState(normalized)).toBe("pass");
	});

	test("keeps the newest run whatever order the nodes arrive in", () => {
		const normalized = normalizeChecks([passed, failed]);
		expect(normalized).toEqual([{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/run/2" }]);
		expect(deriveCiState(normalized)).toBe("pass");
	});

	test("keeps a queued re-run over the completed run it replaces", () => {
		const queued = { ...passed, status: "QUEUED", conclusion: null };
		const normalized = normalizeChecks([failed, queued]);
		expect(normalized).toEqual([{ name: "test", workflow: "ci", bucket: "pending", link: "https://ci/run/2" }]);
		expect(deriveCiState(normalized)).toBe("pending");
	});

	test("keeps two runs of one name that ran on different events", () => {
		const push = run("test", "FAILURE", "2026-09-07T07:00:00Z", { event: "push", url: "https://ci/run/3" });
		expect(normalizeChecks([push, passed])).toEqual([
			{ name: "test", workflow: "ci", bucket: "fail", link: "https://ci/run/3" },
			{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/run/2" },
		]);
	});

	test("keeps two runs of one name that belong to different workflows", () => {
		const other = run("test", "FAILURE", "2026-09-07T07:00:00Z", { workflow: "nightly", url: "https://ci/run/4" });
		expect(normalizeChecks([other, passed])).toEqual([
			{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/run/2" },
			{ name: "test", workflow: "nightly", bucket: "fail", link: "https://ci/run/4" },
		]);
	});

	test("keeps the newest of two status contexts with one name", () => {
		const normalized = normalizeChecks([
			context("FAILURE", "2026-09-07T06:00:00Z", "https://status/1"),
			context("SUCCESS", "2026-09-07T07:00:00Z", "https://status/2"),
		]);
		expect(normalized).toEqual([{ name: "license/cla", workflow: null, bucket: "pass", link: "https://status/2" }]);
	});

	test("keeps the node that carries a start time over one that omits it", () => {
		const { startedAt: _startedAt, ...noStamp } = failed;
		expect(normalizeChecks([passed, noStamp])).toEqual([
			{ name: "test", workflow: "ci", bucket: "pass", link: "https://ci/run/2" },
		]);
	});
});
