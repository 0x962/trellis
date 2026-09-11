import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TicketView } from "./TicketView";

beforeEach(() => localStorage.clear());

for (const variant of ["page", "peek"] as const) {
	for (const phone of [false, true]) {
		test(`${variant} at phone=${phone} has no approval controls or shortcuts`, async () => {
			mockMatchMedia(phone);
			const view = renderWithProviders(<TicketView identifier="CDE-42" variant={variant} />, {
				path: "/t/CDE-42",
				actor: "dana",
			});
			await screen.findByLabelText("Properties");
			expect(screen.queryByRole("button", { name: /^Approve\b|^Send back\b/ })).toBeNull();
			expect(document.querySelector("[data-phone-actions]")).toBeNull();
			await userEvent.setup().keyboard("ar");
			expect(view.server.callsTo("tickets.move")).toHaveLength(0);
			expect(screen.queryByRole("textbox", { name: /Reason/ })).toBeNull();
			mockMatchMedia(false);
		});
	}
}
