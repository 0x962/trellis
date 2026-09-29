import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageChart, type UsageChartProps } from "./UsageChart";

const days = ["2026-09-27", "2026-09-28", "2026-09-29"];
const series = [{ key: "cost", label: "Cost", tone: "agent" as const, values: [2, 4, 3] }];
const props: UsageChartProps = {
	label: "Cost per day",
	days,
	series,
	format: (value) => `$${value}`,
	formatDay: (day) => day.slice(5),
	selectedDay: "2026-09-28",
	onSelectDay: () => {},
	variant: "line",
};

const render = (overrides: Partial<UsageChartProps> = {}) =>
	renderToStaticMarkup(<UsageChart {...props} {...overrides} />);

describe("UsageChart keyboard entry", () => {
	test("uses one button for every chart day", () => {
		const html = render({
			days: Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)),
			series: [{ ...series[0]!, values: Array.from({ length: 90 }, () => 1) }],
		});

		expect(html.match(/<button/g)?.length).toBe(1);
		expect(html).toContain("Use Left and Right to inspect days.");
	});

	test("names the focused day and exposes its selected state", () => {
		const html = render();

		expect(html).toContain('data-day="2026-09-28"');
		expect(html).toContain('aria-label="Cost per day. 09-28: $4"');
		expect(html).toContain('aria-pressed="true"');
	});
});

describe("UsageChart states", () => {
	test("marks the selected day on a line chart", () => {
		const html = render();

		expect(html).toContain('data-selected-day="2026-09-28"');
		expect(html).toContain('data-selected-series="cost"');
		expect(html).toContain('stroke-dasharray="3 3"');
		expect(html).toContain("09-28");
		expect(html).toContain("$4");
	});

	test("supports one zero-value day", () => {
		const html = render({
			days: ["2026-09-29"],
			series: [{ ...series[0]!, values: [0] }],
			selectedDay: "2026-09-29",
		});

		expect(html).toContain('data-day="2026-09-29"');
		expect(html).toContain("$0");
		expect(html).not.toContain("NaN");
	});

	test("supports an empty range", () => {
		const html = render({ days: [], series: [{ ...series[0]!, values: [] }], selectedDay: null });

		expect(html).not.toContain("<button");
		expect(html).not.toContain("NaN");
		expect(html).not.toContain("undefined");
	});

	test("adds no movement animation", () => {
		const html = render();

		expect(html).not.toMatch(/animate-|motion-|transition-/);
	});
});
