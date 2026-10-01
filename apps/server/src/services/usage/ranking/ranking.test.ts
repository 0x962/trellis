import { expect, test } from "bun:test";
import type { UsageRankingInput, UsageReport } from "@trellis/api";
import type { IoCtx } from "../../support.ts";
import { readRankingReport } from "../usage.ts";

const ctx = { home: "/fixture" } as IoCtx;
const computedAt = "2026-09-29T12:00:00.000Z";
const input: UsageRankingInput = { computedAt, days: 7, group: "account", metric: "usd", groupPage: 0, sessionPage: 0 };

test("ranking pages use their exact saved report", async () => {
	const report = { computedAt } as UsageReport;
	const cache = { ranking: async () => report };
	expect(await readRankingReport(ctx, input, cache)).toBe(report);
});

test("an unavailable snapshot cannot supply a ranking page", async () => {
	const cache = { ranking: async () => undefined };
	await expect(readRankingReport(ctx, input, cache)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["computedAt"] }] },
	});
});
