import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
});

describe("routes/settings agents", () => {
	// The Agents block loads after the rest of the page, so it sits last and
	// its arrival moves no other block.
	test("the settings page ends with the Agents block", async () => {
		renderApp({ path: "/settings", actor: "navid" });
		const toggle = await screen.findByRole("switch", { name: "Turn on agents" });
		const rows = [...document.querySelectorAll("[data-settings-row]")];
		expect(rows.at(-1)!.contains(toggle)).toBe(true);
		expect(rows.at(-1)!.textContent).toContain("Agents");
	});
});
