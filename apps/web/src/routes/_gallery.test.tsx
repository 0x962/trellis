import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("routes/_gallery", () => {
	// WS-92. The design reviewer grades the primitives here, so the shell
	// stays out of the frame.
	test("/_gallery renders the ui gallery without the shell", async () => {
		renderApp({ path: "/_gallery", actor: "navid" });
		expect(await screen.findByText("gallery")).toBeDefined();
		expect(screen.getAllByText("trellis").length).toBeGreaterThanOrEqual(1);
		expect(await screen.findByRole("heading", { name: "Button" })).toBeDefined();
		expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
	});
});
