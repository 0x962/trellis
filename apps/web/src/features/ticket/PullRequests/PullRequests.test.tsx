import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { findTicket } from "../../../../test/fake-server/state";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { ago, renderTicket } from "../../../../test/ticketHost";
import { PullRequests } from "./PullRequests";

beforeEach(() => localStorage.clear());

const mount = (identifier: string, server: FakeServer = createFakeServer()) =>
	renderTicket(identifier, (ticket) => <PullRequests ticket={ticket} />, { path: `/t/${identifier}`, server });

const section = () => screen.findByRole("region", { name: /Pull requests/ });

const prOf = (server: FakeServer, identifier: string) => {
	const ticket = findTicket(server.state, identifier)!;
	const link = server.state.prLinks.find((entry) => entry.ticketId === ticket.id)!;
	return server.state.prs.get(link.prId)!;
};

describe("features/ticket/PullRequests", () => {
	// WT-70. A refresh is on demand and names the PR.
	test("shows the fetch age and refreshes on demand", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const pr = prOf(server, "CDE-42");
		pr.fetchedAt = ago(40_000);
		mount("CDE-42", server);
		const element = await section();
		expect(element.textContent).toContain("Fetched 40s ago");
		await user.click(within(element).getByRole("button", { name: "Refresh pull requests" }));
		await waitFor(() => expect(server.callsTo("pullRequests.refresh")).toHaveLength(1));
		expect((server.callsTo("pullRequests.refresh")[0]!.input as { id: string }).id).toBe(pr.id);
	});

	// WT-71. gh problems show where the PRs are, never as a toast.
	test("an unavailable gh shows the inline setup notice", async () => {
		const server = createFakeServer();
		server.state.gh = {
			ok: false,
			user: null,
			reason: "unauthenticated",
			message: "gh is not signed in.",
			checkedAt: ago(0),
		};
		mount("CDE-42", server);
		const element = await section();
		const notice = await within(element).findByText(/gh auth login/);
		expect(notice.closest("code, pre")).not.toBeNull();
		expect(within(screen.getByRole("status")).queryByText(/gh/)).toBeNull();
	});

	// WT-72. The event names the PR; the row repaints from one coalesced
	// `pullRequests.list`. The fake clock drives the coalescer.
	test("a pr.updated event refreshes the row through one refetch", async () => {
		const server = createFakeServer();
		const { queryClient } = mount("CDE-43", server);
		const element = await section();
		await waitFor(() => expect(element.querySelectorAll('[data-bucket="pending"]')).toHaveLength(4));
		const clock = createFakeScheduler();
		const applier = createEventApplier(queryClient, { scheduler: clock.scheduler });
		const ticket = findTicket(server.state, "CDE-43")!;
		const pr = prOf(server, "CDE-43");
		pr.checks = pr.checks.map((check) => ({ ...check, bucket: "pass" }));
		pr.ciState = "pass";
		const lists = server.callsTo("pullRequests.list").length;
		act(() =>
			applier.applyEvent({ type: "pr.updated", id: pr.id, ticketIds: [ticket.id], state: "open", ciState: "pass" }),
		);
		act(() => clock.advanceTo(1000));
		await waitFor(() => expect(server.callsTo("pullRequests.list")).toHaveLength(lists + 1));
		await waitFor(() => expect(element.querySelectorAll('[data-bucket="pass"]')).toHaveLength(4));
		expect(element.querySelectorAll('[data-bucket="pending"]')).toHaveLength(0);
		act(() => clock.advanceTo(5000));
		expect(server.callsTo("pullRequests.list")).toHaveLength(lists + 1);
	});
});
