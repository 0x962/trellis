import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ActorFooter } from "./ActorFooter";

beforeEach(() => localStorage.clear());

describe("features/sidebar/ActorFooter", () => {
	// WS-103
	test("the footer shows the actor chip, settings, and help", async () => {
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid" });
		const avatar = screen.getByRole("img", { name: "navid" });
		expect(avatar.textContent).toBe("N");
		const chip = screen.getByRole("button", { name: /navid/ });
		expect(chip.textContent).toContain("navid");
		const kind = within(chip).getByText("human");
		expect(kind.className).toMatch(/\btext-fg-muted\b/);
		const settings = screen.getByRole("link", { name: "Settings" });
		expect(settings.getAttribute("href")).toBe("/settings");
		expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeDefined();
	});

	// WS-104. The rename lives in a popover on the chip; Enter submits.
	test("the rename popover updates the identity", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid" });
		await user.click(screen.getByRole("button", { name: /navid/ }));
		const input = (await screen.findByRole("textbox", { name: /name/i })) as HTMLInputElement;
		expect(input.value).toBe("navid");
		await user.clear(input);
		await user.type(input, "nk{Enter}");
		expect(JSON.parse(localStorage.getItem("trellis.actor")!)).toEqual({ name: "nk", kind: "human" });
		await waitFor(() => expect(screen.getByRole("button", { name: /^nk/ })).toBeDefined());
		expect(screen.getByRole("img", { name: "nk" }).textContent).toBe("N");
		await waitFor(() => expect(screen.queryByRole("textbox", { name: /name/i })).toBeNull());
	});
});
