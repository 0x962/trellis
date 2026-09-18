import { describe, expect, test } from "bun:test";
import { computeUsageReport, type UsageReportInputs, type UsageRun } from "./aggregate.ts";
import type { CollectedEntry } from "./entries.ts";

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
		expect(result.rankings.usd.groups.account.some((row) => row.key === "account:muse")).toBe(false);
		expect(result.rankings.usd.sessions.some((session) => session.sessionId === "muse-high-tokens")).toBe(false);
	});

	test("does not assign an old run to the current default account", () => {
		const run: UsageRun = {
			id: "run-1",
			kind: "agent",
			name: "Agent",
			ticketIdentifier: null,
			ticketTitle: null,
			projectPath: "TRL",
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
