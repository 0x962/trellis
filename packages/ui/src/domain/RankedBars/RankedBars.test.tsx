import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RankedBars } from "./RankedBars";

const rows = Array.from({ length: 10 }, (_, index) => ({
	key: `row-${index}`,
	label: `Row ${index}`,
	value: 100 - index * 10,
	valueLabel: `$${100 - index * 10}`,
	share: (100 - index * 10) / 550,
	tone: "agent" as const,
	spark: [1, 0, 2],
}));

describe("RankedBars", () => {
	test("shows the limit, then every row after Show all, with the first bar at full width", async () => {
		const user = userEvent.setup();
		const { container } = render(<RankedBars label="By ticket" rows={rows} selected={null} onSelect={() => {}} />);
		const list = screen.getByRole("list", { name: "By ticket" });
		expect(list.querySelectorAll("li")).toHaveLength(8);
		await user.click(screen.getByRole("button", { name: "Show all 10" }));
		expect(list.querySelectorAll("li")).toHaveLength(10);
		const bars = container.querySelectorAll<HTMLElement>("li .bg-agent");
		expect(bars[0]!.style.width).toBe("100%");
		expect(bars[9]!.style.width).toBe("10%");
	});

	test("a click selects the row, and a click on the pressed row clears it", async () => {
		const user = userEvent.setup();
		const onSelect = mock();
		render(<RankedBars label="By ticket" rows={rows} selected="row-1" onSelect={onSelect} limit={3} />);
		const pressed = screen.getByRole("button", { name: /Row 1/ });
		expect(pressed.getAttribute("aria-pressed")).toBe("true");
		await user.click(screen.getByRole("button", { name: /Row 0/ }));
		expect(onSelect).toHaveBeenLastCalledWith("row-0");
		await user.click(pressed);
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});
});
