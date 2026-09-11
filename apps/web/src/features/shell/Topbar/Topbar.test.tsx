import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { createUiStore, useUiStore } from "../../../stores/uiStore";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

describe("features/shell/Topbar", () => {
	// MB-A. A phone has no room for the 240 px sidebar. The topbar leads
	// with a button that opens the sidebar in a sheet from the left, and a
	// navigation closes the sheet.
	test("on a phone the topbar opens the sidebar in a sheet that closes on navigation", async () => {
		mockMatchMedia(true);
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const header = (await screen.findByRole("heading", { name: "All tickets" })).closest("header")!;
		for (const name of ["max-md:h-12", "max-md:px-4"]) expect(header.classList.contains(name)).toBe(true);
		const open = within(header).getByRole("button", { name: "Open the sidebar" });
		expect(header.firstElementChild).toBe(open);
		await user.click(open);
		const sheet = await screen.findByRole("dialog", { name: "Navigation" });
		expect(sheet.style.width).toBe("280px");
		expect(sheet.className).toMatch(/\bduration-popover\b/);
		await user.click(within(sheet).getByRole("link", { name: /Needs you/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull());
	});

	// MB-A. The desktop sidebar leaves the layout below 768 px.
	test("the desktop sidebar hides below 768 px", async () => {
		mockMatchMedia(false);
		renderApp({ path: "/all/table", actor: "navid" });
		const aside = await screen.findByRole("complementary", { name: "Sidebar" });
		expect(aside.classList.contains("max-md:hidden")).toBe(true);
		const header = (await screen.findByRole("heading", { name: "All tickets" })).closest("header")!;
		expect(within(header).queryByRole("button", { name: "Open the sidebar" })).toBeNull();
	});
});
