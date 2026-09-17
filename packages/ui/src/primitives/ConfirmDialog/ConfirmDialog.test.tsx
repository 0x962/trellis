import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { ConfirmDialog } from "./ConfirmDialog";

const setup = (extra: { modal?: boolean } = {}) => {
	const user = userEvent.setup();
	const onConfirm = mock();
	const onCancel = mock();
	render(
		<>
			<button type="button">Outside</button>
			<ConfirmDialog
				open
				title="Delete CDE-42?"
				description="trellis cannot restore a deleted ticket."
				confirmLabel="Delete"
				danger
				onConfirm={onConfirm}
				onCancel={onCancel}
				{...extra}
			/>
		</>,
	);
	return { user, onConfirm, onCancel };
};

describe("ConfirmDialog", () => {
	test("the question names the dialog and the confirm button is red", () => {
		setup();
		screen.getByRole("dialog", { name: "Delete CDE-42?" });
		expectClasses(screen.getByRole("button", { name: "Delete" }), "bg-danger");
	});

	test("Cancel and the confirm button call their handlers", async () => {
		const { user, onConfirm, onCancel } = setup();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	// A confirm that opens on top of another dialog passes modal={false}, so
	// the dialog under it keeps its own focus trap.
	test("modal false leaves the focus free to reach the page behind", async () => {
		setup({ modal: false });
		const dialog = screen.getByRole("dialog", { name: "Delete CDE-42?" });
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
		const outside = screen.getByRole("button", { name: "Outside" });
		outside.focus();
		expect(document.activeElement).toBe(outside);
	});

	// The confirmed action still runs, so a second click would send it twice.
	test("processing disables both answers", () => {
		render(
			<ConfirmDialog
				open
				processing
				title="Stop the agent?"
				description="The agent stops after its current step."
				confirmLabel="Stop"
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByRole("button", { name: "Stop" }).hasAttribute("disabled")).toBe(true);
	});
});
