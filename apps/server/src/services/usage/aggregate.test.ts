import { expect, test } from "bun:test";
import { computeUsageReport, dayKey, rangeStart, type UsageRun } from "./aggregate.ts";
import type { CollectedEntry } from "./entries.ts";

const now = new Date(2026, 8, 16, 15, 0, 0);
const cutoffMs = rangeStart(7, now);
const at = (daysAgo: number, hour = 12) => new Date(2026, 8, 16 - daysAgo, hour).getTime();

const entry = (overrides: Partial<CollectedEntry>): CollectedEntry => ({
	harness: "claude",
	model: "claude-sonnet-5",
	timestampMs: at(0),
	cwd: "/somewhere/else",
	sessionId: "s-outside",
	uncachedInput: 1_000_000,
	cachedInput: 0,
	cacheWrite5m: 0,
	cacheWrite1h: 0,
	output: 0,
	reasoningOutput: 0,
	accounts: [],
	...overrides,
});

const builder: UsageRun = {
	id: "run-1",
	kind: "builder",
	personaName: "Builder",
	ticketIdentifier: "CDE-7",
	ticketTitle: "Add the usage page",
	projectPath: "CDE.web",
	projectName: "Web",
	accountName: "Work",
	sessionId: "s-builder",
	workDir: "/home/agents/run-1/work",
};
const manager: UsageRun = {
	id: "run-2",
	kind: "manager",
	personaName: "Manager",
	ticketIdentifier: null,
	ticketTitle: null,
	projectPath: "CDE",
	projectName: "Canary",
	accountName: null,
	sessionId: "s-manager",
	workDir: "/home/agents/run-2/work",
};

const report = () =>
	computeUsageReport({
		entries: [
			// $2 by session id, on the builder run of ticket CDE-7.
			entry({ sessionId: "s-builder", cwd: "/home/agents/run-1/work", timestampMs: at(1) }),
			// $2 by cwd: a subagent of the same run wrote a new session id.
			entry({ sessionId: "s-sub", cwd: "/home/agents/run-1/work/packages/ui", timestampMs: at(1) }),
			// $1.25 by session id, on the manager run, with Codex.
			entry({ sessionId: "s-manager", harness: "codex", model: "gpt-5", cwd: "/repo", timestampMs: at(0) }),
			// $2 by cwd inside the project directory: a person's own session in
			// a transcript directory two accounts share.
			entry({ sessionId: "s-person", cwd: "/repo/apps/web", accounts: ["Work", "Home"] }),
			// $2 outside every project, in the same shared directory, and named
			// by the state file of the Home profile.
			entry({ sessionId: "s-outside", accounts: ["Work", "Home"] }),
			// Before the range: never counted.
			entry({ sessionId: "s-old", timestampMs: at(9) }),
		],
		sessionLabels: new Map([["s-builder", "Add the usage page"]]),
		scannedFiles: 4,
		runs: [builder, manager],
		projects: [
			{ path: "CDE", name: "Canary", directory: "/repo" },
			{ path: "CDE.web", name: "Web", directory: "" },
		],
		sessionAccounts: new Map([["s-outside", "Home"]]),
		defaultAccounts: { claude: "Work" },
		days: 7,
		cutoffMs,
		now,
	});

test("the day series is contiguous and the totals equal its sum", () => {
	const result = report();
	expect(result.buckets).toHaveLength(7);
	expect(result.buckets[0]!.day).toBe(dayKey(cutoffMs));
	expect(result.buckets[6]!.day).toBe("2026-09-16");
	expect(result.buckets.reduce((sum, bucket) => sum + bucket.usd, 0)).toBeCloseTo(result.totals.usd, 6);
	expect(result.totals.usd).toBeCloseTo(9.25, 6);
	expect(result.buckets[5]!.harnesses).toEqual({ claude: { usd: 4, tokens: 2_000_000 } });
	expect(result.buckets[6]!.harnesses.codex).toEqual({ usd: 1.25, tokens: 1_000_000 });
});

test("a session joins its run by session id, then by worktree, then a project by directory", () => {
	const result = report();
	const ticket = result.groups.ticket;
	expect(ticket.map((row) => [row.key, row.label, row.href, row.usd, row.sessions, row.runs])).toEqual([
		["ticket:CDE-7", "CDE-7", "/t/CDE-7", 4, 2, 1],
		["outside", "Outside Trellis", null, 4, 2, 0],
		["kind:manager", "Managers without a ticket", null, 1.25, 1, 1],
	]);
	expect(ticket[0]!.detail).toBe("Add the usage page");
	expect(result.groups.project.map((row) => [row.key, row.usd])).toEqual([
		["project:CDE.web", 4],
		["project:CDE", 3.25],
		["other:else", 2],
	]);
	expect(result.groups.project[1]!.href).toBe("/p/CDE");
	expect(result.groups.kind.map((row) => [row.key, row.usd])).toEqual([
		["kind:builder", 4],
		["outside", 4],
		["kind:manager", 1.25],
	]);
	expect(result.groups.persona.map((row) => row.label)).toEqual(["Builder", "Outside Trellis", "Manager"]);
});

test("the account of a run wins, then the state file of a profile, and a shared directory says so", () => {
	const rows = report().groups.account;
	expect(rows.map((row) => [row.key, row.usd])).toEqual([
		["account:Work", 4],
		["shared:claude", 2],
		["account:Home", 2],
		["default:codex", 1.25],
	]);
});

test("a run with no account of its own belongs to the default account of its harness", () => {
	const result = computeUsageReport({
		entries: [entry({ sessionId: "s-builder", cwd: "/home/agents/run-1/work", accounts: ["Work", "Home"] })],
		sessionLabels: new Map(),
		scannedFiles: 1,
		runs: [{ ...builder, accountName: null }],
		projects: [],
		sessionAccounts: new Map(),
		defaultAccounts: { claude: "Work" },
		days: 7,
		cutoffMs,
		now,
	});
	expect(result.groups.account.map((row) => row.key)).toEqual(["account:Work"]);
});

test("model and harness rows carry the harness for the chart color", () => {
	const result = report();
	expect(result.groups.model.map((row) => [row.key, row.harness, row.usd])).toEqual([
		["claude|claude-sonnet-5", "claude", 8],
		["codex|gpt-5", "codex", 1.25],
	]);
	expect(result.groups.harness.map((row) => [row.label, row.usd])).toEqual([
		["Claude Code", 8],
		["Codex", 1.25],
	]);
});

test("sessions carry their run, their label, and one key per grouping", () => {
	const result = report();
	const session = result.sessions.find((row) => row.sessionId === "s-builder")!;
	expect(session.run).toEqual({
		id: "run-1",
		kind: "builder",
		persona: "Builder",
		ticketIdentifier: "CDE-7",
		ticketTitle: "Add the usage page",
		projectPath: "CDE.web",
		account: "Work",
	});
	expect(session.label).toBe("Add the usage page");
	expect(session.groupKeys).toEqual({
		ticket: "ticket:CDE-7",
		persona: "persona:Builder",
		project: "project:CDE.web",
		kind: "kind:builder",
		account: "account:Work",
		model: "claude|claude-sonnet-5",
		harness: "claude",
	});
	expect(result.sessions.find((row) => row.sessionId === "s-old")).toBeUndefined();
	expect(result.sessions.map((row) => row.usd)).toEqual([2, 2, 2, 2, 1.25]);
});

test("the totals count sessions, runs, tickets, and the Trellis share", () => {
	const { totals } = report();
	expect(totals.sessions).toBe(5);
	expect(totals.runs).toBe(2);
	expect(totals.tickets).toBe(1);
	expect(totals.trellisUsd).toBeCloseTo(5.25, 6);
	expect(totals.uncachedInput).toBe(5_000_000);
	expect(totals.approximate).toBe(false);
});

test("a day series row is sparse and sorted", () => {
	const row = report().groups.ticket[0]!;
	expect(row.days).toEqual([{ day: "2026-09-15", usd: 4, tokens: 2_000_000 }]);
});
