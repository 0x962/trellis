import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { StatusPicker } from "./StatusPicker";

const server = createFakeServer();
const { statuses } = await server.client.statuses.list({ project: "CDE" });

beforeEach(() => localStorage.clear());

// The picker over the CDE statuses with In Progress as the current value.
const mount = async (user: ReturnType<typeof userEvent.setup>) => {
	const onPick = mock((_status: unknown) => {});
	renderWithProviders(
		<StatusPicker
			statuses={statuses}
			value={statuses[1]!.id}
			onPick={onPick}
			trigger={<button type="button">Status</button>}
		/>,
		{ path: "/p/CDE", actor: "navid", server },
	);
	const trigger = screen.getByRole("button", { name: "Status" });
	await user.click(trigger);
	const dialog = await screen.findByRole("dialog");
	return { onPick, trigger, dialog };
};

describe("features/pickers/StatusPicker", () => {
	// Outcome 83. Spec PK-1: a category shows a heading only when 2 or more
	// statuses share it. In the CDE set only Review does. Every option shows
	// the icon of its own category, in category order.
	test("groups the statuses by category in order", async () => {
		const user = userEvent.setup();
		const { dialog } = await mount(user);
		const groups = [...dialog.querySelectorAll("[cmdk-group]")];
		const headings = groups
			.map((group) => group.querySelector("[cmdk-group-heading]")?.textContent?.trim())
			.filter((heading) => heading !== undefined);
		expect(headings).toEqual(["Review"]);
		const categories = ["todo", "started", "review", "review", "done", "canceled"];
		within(dialog)
			.getAllByRole("option")
			.forEach((option, index) => {
				expect(option.querySelector(`svg[data-category="${categories[index]}"]`), categories[index]).not.toBeNull();
			});
		expect(
			within(dialog)
				.getAllByRole("option")
				.map((option) => option.textContent?.trim()),
		).toEqual(["Todo", "In Progress", "Agent Review", "Human Review", "Done", "Canceled"]);
		const current = within(dialog)
			.getAllByRole("option")
			.filter((option) => option.getAttribute("data-current") === "true");
		expect(current.map((option) => option.textContent?.trim())).toEqual(["In Progress"]);
	});

	// Outcome 84
	test("filters as you type, applies on Enter, and cancels on Esc", async () => {
		const user = userEvent.setup();
		const { onPick, trigger, dialog } = await mount(user);
		await user.keyboard("prog");
		await waitFor(() => expect(within(dialog).getAllByRole("option")).toHaveLength(1));
		await user.keyboard("{Enter}");
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick.mock.calls[0]![0]).toMatchObject({ slug: "in-progress", name: "In Progress" });
		await waitFor(() => expect(dialog.isConnected).toBe(false));
		await user.click(trigger);
		const reopened = await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(reopened.isConnected).toBe(false));
		expect(onPick).toHaveBeenCalledTimes(1);
	});

	// Outcome 88
	test("moves focus into the popover and back to the trigger", async () => {
		const user = userEvent.setup();
		const { trigger, dialog } = await mount(user);
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
		expect(within(dialog).getByRole("listbox")).toBeDefined();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(dialog.isConnected).toBe(false));
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});
});
