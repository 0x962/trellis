import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../../test/fake-server";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { settle } from "../../../../../test/ticketHost";
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

// A new home: one project and no ticket.
const newHome = async () => {
	const server = createFakeServer({ empty: true });
	await server.client.projects.create({ key: "DOC", name: "Docs" });
	return server;
};

const render = (server: ReturnType<typeof createFakeServer>) =>
	renderWithProviders(<NeedsYouEmpty />, { path: "/needs-you", actor: "navid", server });

describe("NeedsYouEmpty", () => {
	// NY-44. The heading states the fact; the line counts the started
	// tickets, human or agent (spec D14).
	test("renders the heading and the line with the in-progress count", async () => {
		render(await withStartedTickets());
		expect(await screen.findByRole("heading", { name: "Nothing needs you" })).toBeDefined();
		expect(await screen.findByText(/^3 tickets are in progress\./)).toBeDefined();
	});

	// NY-47. The Active preset lists the started tickets.
	test("links the line to the Active preset", async () => {
		render(await withStartedTickets());
		const line = await screen.findByText(/tickets are in progress\./);
		const link = within(line).getByRole("link", { name: "Show started tickets" });
		expect(link.getAttribute("href")).toBe("/all?category=started");
	});

	test("offers no link when no ticket is in progress", async () => {
		render(await newHome());
		expect(await screen.findByText("No ticket is in progress.")).toBeDefined();
		expect(screen.queryByRole("link", { name: "Show started tickets" })).toBeNull();
	});

	// A home with no ticket gets a start card: the composer, the CLI line,
	// and the agent settings.
	test("a home with no ticket shows the start card", async () => {
		render(await newHome());
		const card = await screen.findByRole("region", { name: "Start" });
		expect(within(card).getByRole("button", { name: /Create a ticket/ })).toBeDefined();
		expect(card.textContent).toContain('trellis new -p DOC "Ticket title"');
		expect(
			within(card)
				.getByRole("link", { name: /Set up agents/ })
				.getAttribute("href"),
		).toBe("/settings#agents");
	});

	test("the start card stays dismissed after a dismiss", async () => {
		const user = userEvent.setup();
		const server = await newHome();
		const first = render(server);
		const card = await screen.findByRole("region", { name: "Start" });
		await user.click(within(card).getByRole("button", { name: "Dismiss" }));
		expect(screen.queryByRole("region", { name: "Start" })).toBeNull();
		first.unmount();
		render(server);
		await screen.findByText("No ticket is in progress.");
		await settle();
		expect(screen.queryByRole("region", { name: "Start" })).toBeNull();
	});

	test("a home with tickets shows no start card", async () => {
		render(await withStartedTickets());
		await screen.findByText(/tickets are in progress\./);
		expect(screen.queryByRole("region", { name: "Start" })).toBeNull();
	});

	// With no ticket in progress the line names nothing, so a link to "them"
	// has nothing to point at.
	test("shows the heading and a line with no link when no ticket is in progress", async () => {
		const server = createFakeServer({ empty: true });
		await server.client.projects.create({ key: "DOC", name: "Docs" });
		const { findByRole, findByText } = renderWithProviders(<NeedsYouEmpty />, {
			path: "/needs-you",
			actor: "navid",
			server,
		});
		expect(await findByRole("heading", { name: "Nothing needs you" })).toBeDefined();
		const line = await findByText("No ticket is in progress.");
		expect(within(line).queryByRole("link")).toBeNull();
	});
});
