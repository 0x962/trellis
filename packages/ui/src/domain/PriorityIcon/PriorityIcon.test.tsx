import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { PriorityIcon } from "./PriorityIcon";

describe("PriorityIcon", () => {
	test("fills 0, 1, 2, 3 bars by priority", () => {
		render(
			<>
				<PriorityIcon priority="none" />
				<PriorityIcon priority="low" />
				<PriorityIcon priority="medium" />
				<PriorityIcon priority="high" />
			</>,
		);
		const filled: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
		for (const [priority, count] of Object.entries(filled)) {
			const icon = screen.getByLabelText(`Priority: ${priority}`);
			const bars = Array.from(icon.children);
			expect(bars.map((bar) => bar.className)).toHaveLength(3);
			expectClasses(bars[0]!, "h-1");
			expectClasses(bars[1]!, "h-2");
			expectClasses(bars[2]!, "h-3");
			expect(bars.filter((bar) => bar.classList.contains("bg-fg-muted"))).toHaveLength(count);
			expect(bars.filter((bar) => bar.classList.contains("bg-border-strong"))).toHaveLength(3 - count);
		}
	});

	test("urgent renders the filled danger square", () => {
		render(<PriorityIcon priority="urgent" />);
		const icon = screen.getByLabelText("Priority: urgent");
		// The mark is a drawn path, so an option that holds the icon keeps its
		// label as its whole text.
		expect(icon.querySelector("svg path")).not.toBeNull();
		expect(icon.textContent).toBe("");
		expectClasses(icon, "size-3.5 rounded-sm bg-danger");
	});
});
