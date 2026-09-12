import { beforeEach, describe, expect, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useUiStore } from "../../../../../../src/stores/uiStore";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";
import { resetUi } from "../../../../../table";

beforeEach(() => {
	localStorage.clear();
	resetUi();
});

describe("features/board/Board: the sidebar key", () => {
	// On a board, `[` moves the focused card one column to the left. The
	// same press must not collapse the sidebar too.
	test("[ on a focused card moves the card and leaves the sidebar open", async () => {
		const server = createTestServer();
		renderApp({ path: "/p/CDE/board", actor: "dana", server });
		const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
		fireEvent.keyDown(item, { key: "]" });
		await waitFor(() => expect(server.callsTo("tickets.move")).toHaveLength(1));
		const moved = await screen.findByRole("listitem", { name: /^CDE-47 / });
		moved.focus();
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		fireEvent.keyDown(moved, { key: "[" });
		await waitFor(() => expect(server.callsTo("tickets.move")).toHaveLength(2));
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
	});
});
