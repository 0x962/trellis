import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderApp } from "../../../renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/index", () => {
	// WS-71. The redirect replaces the entry, so Back never returns to `/`.
	test("/ redirects to /needs-you", async () => {
		const { router } = renderApp({ path: "/", actor: "dana" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		expect(router.history.canGoBack()).toBe(false);
	});
});
