import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { useUiStore } from "../../../stores/uiStore";
import { Board } from ".";

// The phone query mock replaces a window global, so each test puts the
// original back for the test files that run after it.
const matchMedia = window.matchMedia;
afterEach(() => {
	window.matchMedia = matchMedia;
});

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState({ collapsedGroups: {} });
	mockMatchMedia(true);
});

// MB-B. On a phone each open column is 85% of the window, and the columns
// snap as the strip scrolls.
describe("Board: phone width", () => {
	test("an open column is 85vw wide and snaps", async () => {
		renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
			path: "/p/CDE/board",
			actor: "navid",
		});
		const list = await screen.findByRole("list", { name: /^Todo,/ });
		const column = list.closest("section")!;
		expect(column.style.width).toBe("85vw");
		expect(column.className).toMatch(/\bsnap-start\b/);
	});
});
