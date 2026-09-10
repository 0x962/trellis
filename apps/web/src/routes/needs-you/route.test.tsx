import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { createFakeServer } from "../../../test/fake-server";
import { renderApp } from "../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/needs-you", () => {
	// WS-81. The count pill sums Review and Failing CI, the two sections
	// that need a person. Done by agents today starts collapsed.
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
