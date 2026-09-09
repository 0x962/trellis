import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button/Button";
import { Dialog } from "./Dialog";

const setup = () => {
	const user = userEvent.setup();
	const onOpenChange = mock();
	render(
		<Dialog open title="Delete ticket" onOpenChange={onOpenChange}>
			<p>This cannot be undone.</p>
			<Button>Cancel</Button>
			<Button variant="danger">Delete</Button>
		</Dialog>,
	);
	return { user, onOpenChange, dialog: screen.getByRole("dialog", { name: "Delete ticket" }) };
};

describe("Dialog", () => {
	test("renders a modal dialog named by its title over a scrim", () => {
		const { dialog } = setup();
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		const scrim = document.body.querySelector(".bg-scrim")!;
		expect(scrim).not.toBeNull();
		expect(dialog.contains(scrim)).toBe(false);
		expectClasses(dialog, "bg-elevated rounded-lg shadow-lg border-border duration-popover");
		expectClasses(dialog, "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100");
	});

	test("Escape requests close", async () => {
		const { user, onOpenChange } = setup();
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange.mock.calls[0]![0]).toBe(false);
	});

	test("traps focus inside the dialog", async () => {
		const { user, dialog } = setup();
		// Base UI moves focus into the popup on the frame after it mounts.
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
		const focusable = dialog.querySelectorAll<HTMLElement>(
			'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
		);
		const last = focusable[focusable.length - 1]!;
		last.focus();
		expect(document.activeElement).toBe(last);
		await user.tab();
		expect(document.activeElement).toBe(focusable[0]!);
	});

	test("a child that asks for focus keeps it past the initial focus", async () => {
		render(
			<Dialog open title="Rename" onOpenChange={() => {}}>
				<Button>First</Button>
				<input autoFocus aria-label="Name" />
			</Dialog>,
		);
		const name = screen.getByRole("textbox", { name: "Name" });
		expect(document.activeElement).toBe(name);
		await new Promise((resolve) => setTimeout(resolve, 80));
		expect(document.activeElement).toBe(name);
	});
});
