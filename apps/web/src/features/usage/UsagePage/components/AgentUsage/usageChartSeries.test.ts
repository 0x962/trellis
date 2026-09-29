import { describe, expect, it } from "bun:test";
import type { UsageGroupRow } from "@trellis/api";
import { usageChartSeries } from "./usageChartSeries";

const row: UsageGroupRow = {
	key: "ticket:TRL-661",
	label: "TRL-661 Usage report",
	detail: null,
	href: "/t/TRL-661",
	harness: null,
	usd: 12,
	tokens: 1_200,
	sessions: 2,
	runs: 2,
	approximate: false,
	days: [
		{ day: "2026-09-28", usd: 5, tokens: 500 },
		{ day: "2026-09-29", usd: 7, tokens: 700 },
	],
};

describe("usageChartSeries", () => {
	it("shows one total series until a breakdown row is selected", () => {
		expect(usageChartSeries(["2026-09-28", "2026-09-29"], [9, 14], [row], null, "usd", "ticket")).toEqual([
			{ key: "total", label: "All usage", tone: "agent", values: [9, 14] },
		]);
	});

	it("shows one selected row series with a value for each day", () => {
		expect(
			usageChartSeries(["2026-09-27", "2026-09-28", "2026-09-29"], [2, 9, 14], [row], row, "tokens", "ticket"),
		).toEqual([
			{
				key: "ticket:TRL-661",
				label: "TRL-661 Usage report",
				tone: "success",
				values: [0, 500, 700],
			},
		]);
	});
});
