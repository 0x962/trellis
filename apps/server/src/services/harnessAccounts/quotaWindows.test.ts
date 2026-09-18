import { describe, expect, test } from "bun:test";
import { claudeUsage, codexUsage } from "./quotaWindows.ts";

describe("claudeUsage", () => {
	test("maps model limits and extra usage", () => {
		const usage = claudeUsage({
			five_hour: { utilization: 12.4, resets_at: "2026-09-18T12:00:00.000Z" },
			seven_day_sonnet: { utilization: 40, resets_at: null },
			limits: [
				{
					kind: "weekly_scoped",
					percent: 23.7,
					resets_at: "2026-09-22T00:00:00.000Z",
					scope: { model: { display_name: "Opus" } },
				},
				{
					kind: "weekly_scoped",
					percent: 99,
					scope: { model: { display_name: "Sonnet" } },
				},
			],
			extra_usage: { used_credits: 425, monthly_limit: 2000 },
		});

		expect(usage).toEqual({
			windows: [
				{
					id: "five_hour",
					label: "Session (5h)",
					usedPercent: 12,
					resetsAt: "2026-09-18T12:00:00.000Z",
				},
				{ id: "seven_day_sonnet", label: "Weekly · Sonnet", usedPercent: 40, resetsAt: null },
				{
					id: "weekly_scoped:Opus",
					label: "Weekly · Opus",
					usedPercent: 24,
					resetsAt: "2026-09-22T00:00:00.000Z",
				},
			],
			extraUsage: { usedCents: 425, limitCents: 2000 },
		});
	});

	test("accepts empty values in the provider response", () => {
		expect(
			claudeUsage({
				limits: [{ kind: "weekly_scoped", percent: null, resets_at: null, scope: null }],
				extra_usage: { used_credits: null, monthly_limit: null },
			}),
		).toEqual({ windows: [], extraUsage: null });
	});
});

describe("codexUsage", () => {
	test("maps durations, additional limits, resets, and credits", () => {
		const usage = codexUsage(
			{
				email: "person@example.com",
				plan_type: "business",
				rate_limit: {
					primary_window: { used_percent: 10.4, limit_window_seconds: 18000, reset_after_seconds: 60 },
					secondary_window: {
						used_percent: 20,
						limit_window_seconds: 604800,
						reset_at: Date.parse("2026-09-18T01:00:00.000Z") / 1000,
					},
				},
				additional_rate_limits: [
					{
						limit_name: "GPT-5.3-Codex-Spark",
						rate_limit: {
							primary_window: { used_percent: 31, limit_window_seconds: 86400 },
						},
					},
				],
				credits: { balance: "12.50" },
			},
			Date.parse("2026-09-18T00:00:00.000Z"),
		);

		expect(usage).toEqual({
			email: "person@example.com",
			plan: "business",
			windows: [
				{
					id: "primary",
					label: "Session (5h)",
					usedPercent: 10,
					resetsAt: "2026-09-18T00:01:00.000Z",
				},
				{
					id: "secondary",
					label: "Weekly",
					usedPercent: 20,
					resetsAt: "2026-09-18T01:00:00.000Z",
				},
				{
					id: "additional:GPT-5.3-Codex-Spark",
					label: "1d · GPT-5.3-Codex-Spark",
					usedPercent: 31,
					resetsAt: null,
				},
			],
			creditsBalance: 12.5,
		});
	});

	test("accepts empty additional limits and credits", () => {
		expect(
			codexUsage(
				{
					email: null,
					plan_type: "business",
					rate_limit: null,
					additional_rate_limits: null,
					credits: { balance: null },
				},
				Date.parse("2026-09-18T00:00:00.000Z"),
			),
		).toEqual({ email: null, plan: "business", windows: [], creditsBalance: null });
	});
});
