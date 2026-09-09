import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
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

	// A Sheet without the prop is modal: it draws the scrim and marks the
	// dialog modal. The ticket peek opts out with modal={false}.
	test("modal by default: the scrim draws and aria-modal is true", () => {
		render(
			<Sheet open title="CDE-43" onOpenChange={() => {}}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expect(screen.getByRole("dialog", { name: "CDE-43" }).getAttribute("aria-modal")).toBe("true");
		expect(document.querySelector(".bg-scrim")).not.toBeNull();
	});

	// The ticket peek is a non-modal dialog, so the list behind it stays
	// reachable. j and k walk the list while the peek shows the ticket. A
	// click or a focus move outside the sheet leaves it open.
	test("modal={false}: no scrim, aria-modal false, the page stays reachable, and an outside click leaves it open", async () => {
		const user = userEvent.setup();
		const onOpenChange = mock();
		render(
			<>
				<button type="button">Row</button>
				<Sheet open modal={false} title="CDE-43" onOpenChange={onOpenChange}>
					<p>Merge upstream 1.27</p>
				</Sheet>
			</>,
		);
		const panel = screen.getByRole("dialog", { name: "CDE-43" });
		expect(panel.getAttribute("aria-modal")).toBe("false");
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

	// The peek is resizable: the caller passes the handle element, and the
	// Sheet places it on the edge that faces the page, inside the dialog. The
	// handle comes after the header and the content in DOM order, so the
	// initial focus lands on the close button, never on the handle.
	test("resizeHandle renders on the page-facing edge, after the content, and initial focus skips it", async () => {
		const { rerender } = render(
			<Sheet open title="CDE-43" onOpenChange={() => {}} resizeHandle={<button type="button" aria-label="Resize" />}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		const panel = screen.getByRole("dialog", { name: "CDE-43" });
		const handle = screen.getByRole("button", { name: "Resize" });
		const close = screen.getByRole("button", { name: "Close" });
		expect(panel.contains(handle)).toBe(true);
		expectClasses(handle.parentElement!, "absolute inset-y-0 left-0");
		expect(close.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		expect(
			screen.getByText("Merge upstream 1.27").compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING,
		).not.toBe(0);
		await waitFor(() => expect(document.activeElement).toBe(close));
		rerender(
			<Sheet
				open
				side="left"
				title="CDE-43"
				onOpenChange={() => {}}
				resizeHandle={<button type="button" aria-label="Resize" />}
			>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expectClasses(screen.getByRole("button", { name: "Resize" }).parentElement!, "absolute inset-y-0 right-0");
	});

	test("modal={true} renders the scrim and marks the dialog modal", () => {
		render(
			<Sheet open modal={true} title="CDE-43" onOpenChange={() => {}}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		expect(screen.getByRole("dialog", { name: "CDE-43" }).getAttribute("aria-modal")).toBe("true");
		expectClasses(document.querySelector(".bg-scrim")!, "fixed inset-0 duration-peek");
	});
});
