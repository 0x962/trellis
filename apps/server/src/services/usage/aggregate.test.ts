import { describe, expect, test } from "bun:test";
import { UsageRankingInputSchema } from "@trellis/api";
import { computeUsageReport, type UsageReportInputs, type UsageRun } from "./aggregate.ts";
import type { CollectedEntry } from "./entries.ts";
import { rankingPage } from "./ranking/rankingPage.ts";

const now = new Date("2026-09-17T12:00:00.000Z");
const timestampMs = now.getTime();

const entry = (input: Partial<CollectedEntry> & Pick<CollectedEntry, "sessionId">): CollectedEntry => ({
	harness: "codex",
	model: "gpt-5",
	timestampMs,
	cwd: null,
	uncachedInput: 1,
	cachedInput: 0,
	cacheWrite5m: 0,
	cacheWrite1h: 0,
	output: 0,
	reasoningOutput: 0,
	accounts: [],
	...input,
});

const report = (entries: readonly CollectedEntry[], runs: readonly UsageRun[] = []) =>
	computeUsageReport({
		entries,
		sessionLabels: new Map(),
		scannedFiles: 0,
		runs,
		projects: [],
		sessionAccounts: new Map(),
		days: 7,
		cutoffMs: timestampMs - 1,
		now,
	} satisfies UsageReportInputs);

describe("computeUsageReport", () => {
	test("ranks groups and sessions by the selected metric", () => {
		const expensive = Array.from({ length: 200 }, (_, index) =>
			entry({
				sessionId: `codex-${index}`,
				costUsd: index + 1,
				accounts: [`codex-${index}`],
			}),
		);
		const muse = entry({
			harness: "muse",
			model: "muse-spark-1.3",
			sessionId: "muse-high-tokens",
			uncachedInput: 1_000_000,
			costUsd: 0.01,
			accounts: ["muse"],
		});

		const result = report([...expensive, muse]);
		expect(result.rankings.tokens.groups.account[0]?.key).toBe("account:muse");
		expect(result.rankings.tokens.sessions[0]?.sessionId).toBe("muse-high-tokens");
		expect(result.rankings.usd.groups.account.some((row) => row.key === "account:muse")).toBe(true);
		expect(result.rankings.usd.sessions.some((session) => session.sessionId === "muse-high-tokens")).toBe(true);
	});

	test("does not assign an old run to the current default account", () => {
		const run: UsageRun = {
			id: "run-1",
			kind: "agent",
			name: "Agent",
			ticketIdentifier: null,
			ticketTitle: null,
			projectKey: "TRL",
			projectName: "Trellis",
			accountName: null,
			sessionId: "old-run",
			workDir: "/tmp/work",
		};

		const result = report([entry({ sessionId: "old-run" })], [run]);
		expect(result.rankings.usd.groups.account).toHaveLength(1);
		expect(result.rankings.usd.groups.account[0]?.key).toBe("default:codex");
	});
});

test("every ranked group and session has a page, with complete totals and filters", () => {
	const entries = Array.from({ length: 241 }, (_, index) =>
		entry({
			sessionId: `session-${index}`,
			costUsd: 241 - index,
			uncachedInput: index + 1,
			accounts: [`account-${index}`],
		}),
	);
	const result = report(entries);
	const input = UsageRankingInputSchema.parse({
		days: 7,
		computedAt: result.computedAt,
		metric: "usd",
		group: "account",
	});
	const groups = [];
	const sessions = [];
	for (let page = 0; page < 31; page++) {
		const slice = rankingPage(result, { ...input, groupPage: page });
		expect(slice.groups.length).toBeLessThanOrEqual(8);
		expect(slice.groupTotal).toBe(241);
		groups.push(...slice.groups.map((row) => row.key));
	}
	for (let page = 0; page < 25; page++) {
		const slice = rankingPage(result, { ...input, sessionPage: page });
		expect(slice.sessions.length).toBeLessThanOrEqual(10);
		expect(slice.sessionTotal).toBe(241);
		sessions.push(...slice.sessions.map((session) => session.sessionId));
	}
	expect(groups).toEqual(result.rankings.usd.groups.account.map((row) => row.key));
	expect(sessions).toEqual(entries.map((item) => item.sessionId));
	expect(new Set(groups).size).toBe(241);
	expect(new Set(sessions).size).toBe(241);
	expect(result.totals.usd).toBe((241 * 242) / 2);
	expect(result.totals.tokens).toBe((241 * 242) / 2);
	const lower = rankingPage(result, { ...input, row: "account:account-240" });
	expect(lower.selected?.key).toBe("account:account-240");
	expect(lower.selectedRank).toBe(240);
	expect(lower.sessionTotal).toBe(1);
	expect(lower.sessions[0]?.sessionId).toBe("session-240");
	expect(lower.maxValue).toBe(241);
	expect(rankingPage(result, { ...input, row: "account:account-240", day: "2000-01-01" }).sessions).toEqual([]);
	expect(rankingPage(result, { ...input, row: "missing" }).sessions).toEqual([]);
	expect(rankingPage(result, { ...input, metric: "tokens" }).sessions[0]?.sessionId).toBe("session-240");
});

test("equal ranks use their identity regardless of transcript traversal order", () => {
	const entries = ["c", "a", "b", "é", "e\u0301"].map((sessionId) =>
		entry({ sessionId, costUsd: 1, accounts: [sessionId] }),
	);
	const first = report(entries);
	const second = report([...entries].reverse());
	for (const metric of ["usd", "tokens"] as const) {
		expect(first.rankings[metric].sessions).toEqual(second.rankings[metric].sessions);
		expect(first.rankings[metric].groups.account).toEqual(second.rankings[metric].groups.account);
		expect(first.rankings[metric].sessions.map((session) => session.sessionId)).toEqual([
			"a",
			"b",
			"c",
			"e\u0301",
			"é",
		]);
	}
});
