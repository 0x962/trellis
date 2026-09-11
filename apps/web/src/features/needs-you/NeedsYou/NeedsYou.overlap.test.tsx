import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { rowOf } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { NeedsYou } from "./NeedsYou";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: TestServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<NeedsYou />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

describe("NeedsYou with a ticket in Review and in Failing checks", () => {
	// Spec T9 item 5. A ticket that waits on a review and also has failed
	// checks shows once, in Review, with its failed-check chip. Failing
	// checks leaves it out of its rows and its count.
	test("the ticket shows once, in Review, with the failed-check chip", async () => {
		const server = createTestServer();
		// The seed has no ticket in both sections, so the test moves the first
		// ticket with failed checks into Human Review.
		const seeded = await server.client.inbox.get({});
		await server.client.tickets.move({ ticket: seeded.failingCi.items[0]!.identifier, status: "human-review" });
		const inbox = await server.client.inbox.get({});
		const reviewIds = new Set(inbox.review.items.map((item) => item.identifier));
		const both = inbox.failingCi.items.find((item) => reviewIds.has(item.identifier));
		expect(both).toBeDefined();
		render(server);
		const row = await rowOf(both!.identifier);
		await waitFor(() => expect(document.querySelectorAll(`[data-inbox-row="${both!.identifier}"]`)).toHaveLength(1));
		expect(row.closest("section")?.getAttribute("aria-label")).toBe("Review");
		await waitFor(() => expect(row.querySelector('[data-ci-state="fail"]')).not.toBeNull());
		// The seed has one ticket with failed checks, and it is now in Review.
		// Failing checks has no row left, so the section does not show.
		const only = inbox.failingCi.items.filter((item) => !reviewIds.has(item.identifier)).length;
		expect(only).toBe(0);
		expect(screen.queryByRole("button", { name: /^Failing checks/ })).toBeNull();
	});
});
