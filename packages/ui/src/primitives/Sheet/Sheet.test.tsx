import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
	test("right-side sheet dialog with peek duration, Escape closes", async () => {
		const user = userEvent.setup();
		const onOpenChange = mock();
		render(
			<Sheet open side="right" title="CDE-43" onOpenChange={onOpenChange}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		const panel = screen.getByRole("dialog", { name: "CDE-43" });
		expectClasses(panel, "fixed inset-y-0 right-0 bg-surface border-l border-border duration-peek");
		// The plan turns a slide into a fade under reduced motion.
		expectClasses(
			panel,
			"motion-reduce:transition-opacity motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0",
		);
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange.mock.calls[0]![0]).toBe(false);
	});

	// The ticket peek is a non-modal dialog: the list behind it stays
	// reachable, so j and k walk the list while the peek shows the ticket. A
	// click or a focus move outside the sheet leaves it open.
	test("non-modal by default: no scrim, no aria-modal, the page stays reachable, and an outside click leaves it open", async () => {
		const user = userEvent.setup();
		const onOpenChange = mock();
		render(
			<>
				<button type="button">Row</button>
				<Sheet open title="CDE-43" onOpenChange={onOpenChange}>
					<p>Merge upstream 1.27</p>
				</Sheet>
			</>,
		);
		const panel = screen.getByRole("dialog", { name: "CDE-43" });
		expect(panel.getAttribute("aria-modal")).toBeNull();
		expect(document.querySelector(".bg-scrim")).toBeNull();
		const row = screen.getByRole("button", { name: "Row" });
		expect(row.closest("[aria-hidden='true']")).toBeNull();
		await user.click(row);
		row.focus();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("the sheet is 720 px wide and the caller sets another width", () => {
		const { rerender } = render(
			<Sheet open title="CDE-43" onOpenChange={() => {}}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expect(screen.getByRole("dialog", { name: "CDE-43" }).style.width).toBe("720px");
		rerender(
			<Sheet open title="CDE-43" width={900} onOpenChange={() => {}}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expect(screen.getByRole("dialog", { name: "CDE-43" }).style.width).toBe("900px");
	});

	test("modal renders the scrim and marks the dialog modal", () => {
		render(
			<Sheet open modal title="CDE-43" onOpenChange={() => {}}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expect(screen.getByRole("dialog", { name: "CDE-43" }).getAttribute("aria-modal")).toBe("true");
		expectClasses(document.querySelector(".bg-scrim")!, "fixed inset-0 duration-peek");
	});
});
