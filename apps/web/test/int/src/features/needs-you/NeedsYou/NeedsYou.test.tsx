import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rowOf, seededReview } from "../../../../../inbox";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";

beforeEach(() => localStorage.clear());

const section = (name: string) => screen.getByRole("region", { name });

// The seed holds three review rows, one failing-CI row, one stalled row, and
// six rows the agents finished today.
describe("features/needs-you/NeedsYou", () => {
	// TRL-27. The landing page lists what waits on a person.
	test("lists the four inbox sections with their rows", async () => {
		renderApp({ path: "/needs-you", actor: "dana" });
		await rowOf(seededReview[0]!);
		for (const name of ["Review", "Failing checks", "Stalled", "Done by agents today"]) {
			expect(section(name)).toBeDefined();
		}
		const review = section("Review");
		const listed = [...review.querySelectorAll("[data-inbox-row]")].map((row) => row.getAttribute("data-inbox-row"));
		expect(listed).toEqual(seededReview);
		expect(within(review).getByText("Restore the fork pages after the upstream 1.27 merge")).toBeDefined();
		expect(within(section("Stalled")).getAllByRole("link")).toHaveLength(1);
		expect(within(section("Failing checks")).getAllByRole("link")).toHaveLength(1);
	});

	// TRL-27. Done by agents today is news and not work, so it opens on demand.
	test("opens Done by agents today from its header", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/needs-you", actor: "dana" });
		await rowOf(seededReview[0]!);
		const done = section("Done by agents today");
		expect(done.querySelectorAll("[data-inbox-row]")).toHaveLength(0);
		await user.click(within(done).getByRole("button", { name: /^Done by agents today/ }));
		await waitFor(() => expect(done.querySelectorAll("[data-inbox-row]").length).toBe(6));
	});

	// TRL-27. A row opens the ticket page, where the person acts on it.
	test("a row opens the ticket page", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/needs-you", actor: "dana" });
		const row = await rowOf(seededReview[0]!);
		await user.click(row);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/t/${seededReview[0]!}`));
	});

	// TRL-27. The approval shortcuts stay removed: a key press moves no ticket.
	test("no key press moves a ticket", async () => {
		const server = createTestServer();
		renderApp({ path: "/needs-you", actor: "dana", server });
		await rowOf(seededReview[0]!);
		await userEvent.setup().keyboard("arjk{Enter}");
		expect(server.callsTo("tickets.move")).toHaveLength(0);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// TRL-27. An empty inbox states the fact and counts the work in flight.
	test("shows the empty state with the count of tickets in progress", async () => {
		const server = createTestServer({
			empty: true,
			prepare: async (client) => {
				await client.projects.create({ key: "EMP", name: "Empty" });
				const ticket = await client.tickets.create({ project: "EMP", title: "A ticket an agent works on" });
				await client.tickets.move({ ticket: ticket.identifier, status: "in-progress" });
			},
		});
		renderApp({ path: "/needs-you", actor: "dana", server });
		expect(await screen.findByText("Nothing needs you")).toBeDefined();
		expect(await screen.findByText("1 ticket is in progress.")).toBeDefined();
		expect(document.querySelector("[data-inbox-row]")).toBeNull();
	});
});
