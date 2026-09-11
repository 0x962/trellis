import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
});

describe("routes/settings agents", () => {
	// The Agent manager block loads its own data, so it has a settings page of
	// its own and its arrival moves no other page.
	test("the Agent manager page carries the agents switch", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/settings", actor: "dana" });
		const nav = await screen.findByRole("navigation", { name: "Settings" });
		await user.click(within(nav).getByRole("link", { name: "Agent manager" }));
		expect(router.state.location.hash).toBe("manager");
		const toggle = await screen.findByRole("switch", { name: "Turn on agents" });
		const page = toggle.closest(".project-settings-page") as HTMLElement;
		expect(page.hidden).toBe(false);
		expect(within(page).getByRole("heading", { name: "Agent manager", level: 2 })).toBeDefined();
	});
});
