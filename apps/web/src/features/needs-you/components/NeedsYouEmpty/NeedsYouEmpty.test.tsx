import { beforeEach, describe, expect, test } from "bun:test";
import { within } from "@testing-library/react";
import { createFakeServer } from "../../../../../test/fake-server";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { NeedsYouEmpty } from "./NeedsYouEmpty";

beforeEach(() => localStorage.clear());

// A server with nothing waiting on a person and three tickets an agent
// started.
const withStartedTickets = async () => {
	const server = createFakeServer({ empty: true });
	await server.client.projects.create({ key: "DOC", name: "Docs" });
	const agent = server.clientAs("agent:claude-code");
	for (const title of ["one", "two", "three"]) {
		const ticket = await agent.tickets.create({ project: "DOC", title });
		await agent.tickets.move({ ticket: ticket.identifier, status: "in-progress" });
	}
	return server;
};

describe("NeedsYouEmpty", () => {
	// NY-44. The line is the whole screen, and it names what the agents hold.
	test("renders the exact empty sentence with the in-progress count", async () => {
		const server = await withStartedTickets();
		const { findByText } = renderWithProviders(<NeedsYouEmpty />, { path: "/needs-you", actor: "navid", server });
		expect(await findByText(/Nothing needs you\. 3 tickets in progress by agents\./)).toBeDefined();
	});

	// NY-47. The Active preset lists what the agents hold.
	test("links the line to the Active preset", async () => {
		const server = await withStartedTickets();
		const { findByText } = renderWithProviders(<NeedsYouEmpty />, { path: "/needs-you", actor: "navid", server });
		const line = await findByText(/Nothing needs you\./);
		expect(within(line).getByRole("link").getAttribute("href")).toBe("/all?category=started");
	});
});
