import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusPicker } from "../../../../../../src/features/pickers/StatusPicker/StatusPicker";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";

const server = createTestServer();
const { statuses } = await server.client.statuses.list({ project: "CDE" });

beforeEach(() => localStorage.clear());

// The CDE set: Todo, In Progress, Agent Review, Human Review, Done,
// Canceled. In Progress is the current value.
const mount = async (user: ReturnType<typeof userEvent.setup>) => {
	const onPick = mock((_status: unknown) => {});
	renderWithProviders(
		<StatusPicker
			statuses={statuses}
			value={statuses[1]!.id}
			onPick={onPick}
			trigger={<button type="button">Status</button>}
		/>,
		{ path: "/p/CDE", actor: "dana", server },
	);
	await user.click(screen.getByRole("button", { name: "Status" }));
	const dialog = await screen.findByRole("dialog");
	await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
	return { onPick, dialog };
};

describe("features/pickers/StatusPicker keys and marks", () => {
	// A heading names a category only when 2 or more statuses share it. One
	// status per category needs no heading: its icon says the category.
	test("heads only the categories that hold 2 or more statuses, with no icon", async () => {
		const user = userEvent.setup();
		const { dialog } = await mount(user);
		const headings = [...dialog.querySelectorAll("[cmdk-group-heading]")].map((node) => node.textContent?.trim());
		expect(headings).toEqual(["Review"]);
		expect(dialog.querySelector("[cmdk-group-heading] svg")).toBeNull();
	});

	// The current value carries a check. Every row shows its number key.
	test("marks the current status with a check and numbers the rows 1 to 6", async () => {
		const user = userEvent.setup();
		const { dialog } = await mount(user);
		const options = within(dialog).getAllByRole("option");
		expect(options.map((option) => option.querySelector("[data-key]")?.getAttribute("data-key"))).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
		const checked = options.filter((option) => option.querySelector("[data-current-mark]") !== null);
		expect(checked.map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim())).toEqual([
			"In Progress",
		]);
	});

	// A number key picks its row while the search field is empty. With text
	// in the field, a digit is text.
	test("a number key picks its row, and a typed digit after text filters", async () => {
		const user = userEvent.setup();
		const { onPick } = await mount(user);
		await user.keyboard("4");
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick.mock.calls[0]![0]).toMatchObject({ name: "Human Review" });
	});
});
