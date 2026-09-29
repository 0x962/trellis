import { expect, test } from "bun:test";
import type { UsageRankingInput, UsageReport } from "@trellis/api";
import type { IoCtx } from "../../support.ts";
import { readRankingReport } from "../usage.ts";

const ctx = { home: "/fixture" } as IoCtx;
const computedAt = "2026-09-29T12:00:00.000Z";
const input: UsageRankingInput = { computedAt, days: 7, group: "account", metric: "usd", groupPage: 0, sessionPage: 0 };

test("ranking pages use their exact cached report even after its refresh interval", async () => {
	const report = { computedAt } as UsageReport;
	const cache = new Map([["/fixture:7", { at: 0, result: Promise.resolve(report) }]]);
	expect(await readRankingReport(ctx, input, cache)).toBe(report);
});

test("a replacement or missing snapshot cannot supply a page of another report", async () => {
	const cache = new Map([
		["/fixture:7", { at: 0, result: Promise.resolve({ computedAt: "2026-09-29T13:00:00.000Z" } as UsageReport) }],
	]);
	await expect(readRankingReport(ctx, input, cache)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["computedAt"] }] },
	});
	await expect(readRankingReport(ctx, input, new Map())).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["computedAt"] }] },
	});
});
