import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

describe("components/ConfirmDialog", () => {
	// A dialog's footer buttons are 32 px, and below 768 px each one takes an
	// equal share of the sheet width.
	test("the two answers are md buttons that fill the footer on a phone", () => {
		render(
			<ConfirmDialog
				open
				title="Delete CDE-42?"
				description="trellis cannot restore a deleted ticket."
				confirmLabel="Delete"
				danger
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		);
		const cancel = screen.getByRole("button", { name: "Cancel" });
		const confirm = screen.getByRole("button", { name: "Delete" });
		for (const button of [cancel, confirm]) expect(button.className).toMatch(/\bh-8\b/);
		expect(confirm.className).toMatch(/\bbg-danger\b/);
		expect(cancel.parentElement!.className).toMatch(/max-md:\*:flex-1/);
	});

	test("Cancel and the confirm button call their handlers", async () => {
		const user = userEvent.setup();
		const onConfirm = mock();
		const onCancel = mock();
		render(<ConfirmDialog open title="Discard?" confirmLabel="Discard" onConfirm={onConfirm} onCancel={onCancel} />);
		await user.click(screen.getByRole("button", { name: "Discard" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
