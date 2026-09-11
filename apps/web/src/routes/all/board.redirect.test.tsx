import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderApp } from "../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

// /all used to show the table and /all/board showed the board. The board is
// the bare path now, so a bookmark of /all/board must still open the board
// instead of the not-found page. The project routes already do this; these
// tests hold /all to the same rule.
describe("routes/all: an older /all/board link", () => {
	test("/all/board lands on /all", async () => {
		const { router } = renderApp({ path: "/all/board", actor: "dana" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
	});

	test("/all/board keeps the filters of the link", async () => {
		const { router } = renderApp({ path: "/all/board?status=todo", actor: "dana" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
		expect(router.state.location.searchStr).toBe("?status=todo");
	});
});
