import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StackedBar } from "./StackedBar";

describe("StackedBar", () => {
	test("each segment takes its share of the width, and an empty segment is left out", () => {
		const { container } = render(
			<StackedBar
				label="Tokens by kind"
				segments={[
					{ key: "cached", label: "Cached input", value: 75, valueLabel: "75K", tone: "agent" },
					{ key: "output", label: "Output", value: 25, valueLabel: "25K", tone: "fg" },
					{ key: "write", label: "Cache write", value: 0, valueLabel: "0", tone: "warning" },
				]}
			/>,
		);
		expect(screen.getByRole("img", { name: "Tokens by kind" })).toBeTruthy();
		const cached = container.querySelector<HTMLElement>("[data-segment='cached']")!;
		expect(cached.style.width).toBe("75%");
		expect(cached.classList.contains("bg-agent")).toBe(true);
		expect(container.querySelector("[data-segment='write']")).toBeNull();
		expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
			"Cached input75K75%",
			"Output25K25%",
		]);
	});
});
