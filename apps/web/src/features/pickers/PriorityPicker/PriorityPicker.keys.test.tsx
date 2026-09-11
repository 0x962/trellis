import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PriorityPicker } from "./PriorityPicker";

const mount = async (user: ReturnType<typeof userEvent.setup>) => {
	const onPick = mock((_priority: string) => {});
	renderWithProviders(
		<PriorityPicker value="medium" onPick={onPick} trigger={<button type="button">Priority</button>} />,
		{ path: "/p/CDE", actor: "dana" },
	);
	await user.click(screen.getByRole("button", { name: "Priority" }));
	const dialog = await screen.findByRole("dialog");
	await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
	return { onPick, dialog };
};

describe("features/pickers/PriorityPicker keys and marks", () => {
	// None, Urgent, High, Medium, Low take the keys 0 to 4.
	test("numbers the rows 0 to 4 and checks the current priority", async () => {
		const user = userEvent.setup();
		const { dialog } = await mount(user);
		const options = within(dialog).getAllByRole("option");
		expect(options.map((option) => option.querySelector("[data-key]")?.getAttribute("data-key"))).toEqual([
			"0",
			"1",
			"2",
			"3",
			"4",
		]);
		const checked = options.filter((option) => option.querySelector("[data-current-mark]") !== null);
		expect(checked.map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim())).toEqual([
			"Medium",
		]);
	});

	// The marks are decoration. The option's name is its label alone, so a
	// screen reader says "High" and a query by name finds the option.
	test("each option is named by its label alone", async () => {
		const user = userEvent.setup();
		const { dialog } = await mount(user);
		for (const name of ["None", "Urgent", "High", "Medium", "Low"]) {
			expect(within(dialog).getByRole("option", { name })).toBeDefined();
		}
	});

	test("a number key picks its priority", async () => {
		const user = userEvent.setup();
		const { onPick } = await mount(user);
		await user.keyboard("2");
		expect(onPick).toHaveBeenCalledWith("high");
	});
});
