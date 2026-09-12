import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { PriorityPicker } from "../../../../../../src/features/pickers/PriorityPicker/PriorityPicker";

const order = ["none", "urgent", "high", "medium", "low"];

describe("features/pickers/PriorityPicker", () => {
	// Outcome 85. The list follows the contract order of PrioritySchema.
	test("lists every priority with its icon and applies the choice", async () => {
		const user = userEvent.setup();
		const onPick = mock((_priority: string) => {});
		renderWithProviders(
			<PriorityPicker value="medium" onPick={onPick} trigger={<button type="button">Priority</button>} />,
			{ path: "/p/CDE", actor: "dana" },
		);
		await user.click(screen.getByRole("button", { name: "Priority" }));
		const dialog = await screen.findByRole("dialog");
		const options = within(dialog).getAllByRole("option");
		expect(options.map((option) => option.textContent?.trim().toLowerCase())).toEqual(order);
		for (const priority of order) {
			expect(within(dialog).getByRole("img", { name: `Priority: ${priority}` })).toBeDefined();
		}
		await user.keyboard("high");
		await waitFor(() => expect(within(dialog).getAllByRole("option")).toHaveLength(1));
		await user.keyboard("{Enter}");
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick).toHaveBeenCalledWith("high");
	});
});
