import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsageChart } from "./UsageChart";

const days = ["2026-09-14", "2026-09-15", "2026-09-16"];
const series = [
	{ key: "claude", label: "Claude Code", tone: "agent" as const, values: [1, 4, 2] },
	{ key: "codex", label: "Codex", tone: "fg" as const, values: [0, 1, 1] },
];
const format = (value: number) => `$${value.toFixed(2)}`;
const formatDay = (day: string) => day.slice(5);

describe("UsageChart", () => {
	test("stacks one segment per series on each day, and skips a zero segment", () => {
		const { container } = render(
			<UsageChart
				label="Cost per day"
				days={days}
				series={series}
				format={format}
				formatDay={formatDay}
				selectedDay={null}
				onSelectDay={() => {}}
			/>,
		);
		expect(screen.getByRole("img", { name: "Cost per day" })).toBeTruthy();
		expect(container.querySelectorAll("[data-series='claude']")).toHaveLength(3);
		expect(container.querySelectorAll("[data-series='codex']")).toHaveLength(2);
		expect(container.querySelector("[data-series='claude']")?.classList.contains("fill-agent")).toBe(true);
		const buttons = screen.getAllByRole("button");
		expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
			"09-14: $1.00",
			"09-15: $5.00",
			"09-16: $3.00",
		]);
		// The top gridline is a round figure at or above the largest day total.
		expect(screen.getByText("$5.00")).toBeTruthy();
	});

	test("a click selects the day, a second click clears it, and the caption prints the day", async () => {
		const user = userEvent.setup();
		const onSelectDay = mock();
		const { rerender } = render(
			<UsageChart
				label="Cost per day"
				days={days}
				series={series}
				format={format}
				formatDay={formatDay}
				selectedDay={null}
				onSelectDay={onSelectDay}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "09-15: $5.00" }));
		expect(onSelectDay).toHaveBeenLastCalledWith("2026-09-15");
		rerender(
			<UsageChart
				label="Cost per day"
				days={days}
				series={series}
				format={format}
				formatDay={formatDay}
				selectedDay="2026-09-15"
				onSelectDay={onSelectDay}
			/>,
		);
		const selected = screen.getByRole("button", { name: "09-15: $5.00" });
		expect(selected.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByRole("status").textContent).toContain("09-15 · $5.00");
		expect(screen.getByRole("status").textContent).toContain("$4.00");
		await user.click(selected);
		expect(onSelectDay).toHaveBeenLastCalledWith(null);
	});
});
