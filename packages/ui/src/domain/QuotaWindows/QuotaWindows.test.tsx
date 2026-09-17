import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QuotaWindows, quotaFillClass } from "./QuotaWindows";

describe("QuotaWindows", () => {
	test("a bar is green under half, yellow to 80%, and red from 80%", () => {
		expect(quotaFillClass(0)).toBe("bg-success");
		expect(quotaFillClass(49)).toBe("bg-success");
		expect(quotaFillClass(50)).toBe("bg-warning");
		expect(quotaFillClass(79)).toBe("bg-warning");
		expect(quotaFillClass(80)).toBe("bg-danger");
		expect(quotaFillClass(100)).toBe("bg-danger");
	});

	test("each window is a progress bar with its share as the fill width", () => {
		render(
			<QuotaWindows
				name="Work"
				windows={[
					{ id: "five_hour", label: "Session (5h)", usedPercent: 92, resetsAt: null },
					{ id: "seven_day", label: "Weekly", usedPercent: 12, resetsAt: null },
				]}
			/>,
		);
		const session = screen.getByRole("progressbar", { name: "Work: Session (5h)" });
		expect(session.getAttribute("aria-valuenow")).toBe("92");
		const fill = session.querySelector<HTMLElement>("[data-quota-fill]")!;
		expect(fill.style.width).toBe("92%");
		expect(fill.classList.contains("bg-danger")).toBe(true);
		const weekly = screen.getByRole("progressbar", { name: "Work: Weekly" }).querySelector("[data-quota-fill]")!;
		expect(weekly.classList.contains("bg-success")).toBe(true);
	});
});
