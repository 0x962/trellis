import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TicketSummary } from "@trellis/api";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { TicketPicker } from "./TicketPicker";

const optionTexts = (dialog: HTMLElement) =>
	within(dialog)
		.getAllByRole("option")
		.map((option) => option.textContent ?? "");

describe("features/pickers/TicketPicker", () => {
	// Outcome 87. The seed holds one OAuth ticket, CDE-51.
	test("finds a ticket by identifier and by title, and clears the parent", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const onPick = mock((_ticket: TicketSummary | null) => {});
		renderWithProviders(
			<TicketPicker project="CDE" value="CDE-43" onPick={onPick} trigger={<button type="button">Parent</button>} />,
			{ path: "/p/CDE", actor: "navid", server },
		);
		await user.click(screen.getByRole("button", { name: "Parent" }));
		const dialog = await screen.findByRole("dialog");
		const search = within(dialog).getByRole("combobox");
		await user.click(search);
		await user.keyboard("CDE-42");
		await waitFor(() => expect(optionTexts(dialog)[0]).toContain("CDE-42"));
		await user.clear(search);
		await user.keyboard("oauth");
		await waitFor(() => expect(optionTexts(dialog).some((text) => /OAuth/.test(text))).toBe(true));
		expect(optionTexts(dialog).find((text) => /OAuth/.test(text))).toContain("CDE-51");
		await user.clear(search);
		await user.click(within(dialog).getByRole("option", { name: /^none$/i }));
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick).toHaveBeenCalledWith(null);
	});
});
