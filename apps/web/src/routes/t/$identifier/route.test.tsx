import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../../test/renderWithProviders";
import { fieldValue } from "../../../../test/ticketHost";

beforeEach(() => localStorage.clear());

describe("routes/t/$identifier", () => {
	// WS-89. The URL may carry any case; the API call and the page use the
	// canonical identifier. The title is the editable field of the ticket
	// surfaces (WT-25), so the page carries it as a textbox.
	test("the ticket page loads by canonical identifier and shows the header chrome", async () => {
		const { server } = renderApp({ path: "/t/cde-42", actor: "dana" });
		const title = "Restore the fork pages after the upstream 1.27 merge";
		const field = await screen.findByRole("textbox", { name: "Title" });
		await waitFor(() => expect(fieldValue(field)).toBe(title));
		const call = server.calls.find((entry) => entry.path.join(".") === "tickets.get");
		expect(call!.input).toEqual({ ticket: "CDE-42" });
		const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(crumbs.textContent!.replace(/\s+/g, " ")).toMatch(/CDE\s*›\s*web/);
		const marks = screen.getAllByText("CDE-42");
		const mark = marks.find((element) => /\bfont-mono\b/.test(element.className));
		expect(mark).toBeDefined();
		expect(mark!.className).toMatch(/\btabular\b/);
		await waitFor(() => expect(document.title).toBe(`CDE-42 · ${title}`));
	});

	// WS-90
	test("an unknown ticket shows the 404 state with a search link", async () => {
		renderApp({ path: "/t/CDE-999", actor: "dana" });
		expect(await screen.findByText("CDE-999 does not exist")).toBeDefined();
		// The sidebar carries a Search link of its own, so the query stays inside main.
		const link = within(screen.getByRole("main")).getByRole("link", { name: /search/i });
		expect(link.getAttribute("href")).toBe("/search?q=CDE-999");
	});
});
