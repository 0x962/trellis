import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useComposerStore } from "../../../../../../src/features/composer";
import { NewTicketButton } from "../../../../../../src/features/shell/NewTicketButton/NewTicketButton";
import { renderWithProviders } from "../../../../../renderWithProviders";

beforeEach(() => {
	useComposerStore.setState({ open: false, options: {} });
});

describe("features/shell/NewTicketButton", () => {
	test("the button is the primary sm button with the c key", () => {
		renderWithProviders(<NewTicketButton />, { path: "/all/table", actor: "dana" });
		const button = screen.getByRole("button", { name: /New ticket/ });
		expect(button.className).toMatch(/\bbg-surface\b/);
		expect(button.className).toMatch(/\bh-7\b/);
		expect(button.querySelector("kbd")!.textContent).toBe("c");
	});

	// A filter or a grouping of the page never seeds the status: only the
	// project of the page reaches the dialog.
	test("a click opens the New ticket dialog in the project of the page", async () => {
		const user = userEvent.setup();
		renderWithProviders(<NewTicketButton />, { path: "/p/CDE/web?status=human-review", actor: "dana" });
		await user.click(screen.getByRole("button", { name: /New ticket/ }));
		expect(useComposerStore.getState()).toEqual({ open: true, options: { project: "CDE.web" } });
	});

	test("off a project page the dialog opens with no project", async () => {
		const user = userEvent.setup();
		renderWithProviders(<NewTicketButton />, { path: "/all/table", actor: "dana" });
		await user.click(screen.getByRole("button", { name: /New ticket/ }));
		expect(useComposerStore.getState()).toEqual({ open: true, options: {} });
	});
});
