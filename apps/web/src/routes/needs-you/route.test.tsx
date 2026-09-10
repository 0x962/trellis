import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../test/fake-server";
import { focusRow, rowOf } from "../../../test/inbox";
import { renderApp } from "../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/needs-you", () => {
	// WS-81. The count pill counts the distinct tickets of Review and Failing
	// checks (D13), the same number the sidebar badge shows. The seed has 3
	// in review and 1 other ticket with failed checks. Done by agents today
	// starts collapsed.
	test("Needs you renders the topbar count and the four section headers from inbox.get", async () => {
		renderApp({ path: "/needs-you", actor: "navid" });
		const heading = await screen.findByRole("heading", { name: /Needs you/ });
		expect(within(heading).getByText("4")).toBeDefined();
		const sections = ["Review", "Failing CI", "Stalled", "Done by agents today"];
		const counts = ["3", "1", "1", "6"];
		for (const [index, name] of sections.entries()) {
			const button = await screen.findByRole("button", { name: new RegExp(`^${name}`) });
			expect(within(button).getByText(counts[index]!)).toBeDefined();
			expect(button.getAttribute("aria-expanded")).toBe(name === "Done by agents today" ? "false" : "true");
		}
		expect(screen.queryByText(/Nothing needs you/)).toBeNull();
	});

	// WS-82. Three started tickets whose last actor is an agent, and nothing
	// waiting on a person.
	test("the Needs you empty state names the agents' in-progress count", async () => {
		const server = createFakeServer({ empty: true });
		await server.client.projects.create({ key: "DOC", name: "Docs" });
		const agent = server.clientAs("agent:claude-code");
		for (const title of ["one", "two", "three"]) {
			const ticket = await agent.tickets.create({ project: "DOC", title });
			await agent.tickets.move({ ticket: ticket.identifier, status: "in-progress" });
		}
		const inbox = await server.client.inbox.get({});
		expect([inbox.review.total, inbox.failingCi.total, inbox.stalled.total, inbox.doneByAgentsToday.total]).toEqual([
			0, 0, 0, 0,
		]);
		renderApp({ path: "/needs-you", actor: "navid", server });
		const line = await screen.findByText("Nothing needs you. 3 tickets in progress by agents.");
		const link = within(line).getByRole("link");
		expect(link.getAttribute("href")).toBe("/all?category=started");
		for (const name of ["Review", "Failing CI", "Stalled", "Done by agents today"]) {
			expect(screen.queryByRole("button", { name: new RegExp(`^${name}`) })).toBeNull();
		}
	});
});

// Enter on a row writes `?peek=`, and the route must mount the peek that
// reads it. The seeded Review section lists CDE-42, CDE-37, and TRL-9 in
// that order.
describe("routes/needs-you: the peek", () => {
	test("Enter on a focused row opens the peek, and j and k walk the rows", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/needs-you", actor: "navid" });
		await focusRow("CDE-42");
		await user.keyboard("{Enter}");
		await screen.findByRole("dialog", { name: "CDE-42" });
		await user.keyboard("j");
		await screen.findByRole("dialog", { name: "CDE-37" });
		expect(router.state.location.search).toEqual({ peek: "CDE-37" });
		await user.keyboard("k");
		await screen.findByRole("dialog", { name: "CDE-42" });
		expect(router.state.location.search).toEqual({ peek: "CDE-42" });
	});

	test("Escape closes the peek with the focus on the row of the ticket it shows", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/needs-you", actor: "navid" });
		await focusRow("CDE-42");
		await user.keyboard("{Enter}");
		await screen.findByRole("dialog", { name: "CDE-42" });
		await user.keyboard("j");
		await screen.findByRole("dialog", { name: "CDE-37" });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).toEqual({});
		const row = await rowOf("CDE-37");
		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	test("o in the peek opens the full ticket page", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/needs-you", actor: "navid" });
		await focusRow("CDE-42");
		await user.keyboard("{Enter}");
		await screen.findByRole("dialog", { name: "CDE-42" });
		await user.keyboard("o");
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-42"));
	});
});
