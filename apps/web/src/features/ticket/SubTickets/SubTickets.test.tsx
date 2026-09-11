import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PullRequest } from "@trellis/api";
import { ulid } from "ulid";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { findTicket } from "../../../../test/fake-server/state";
import { ago, hour, renderTicket } from "../../../../test/ticketHost";
import { useComposerStore } from "../../composer";
import { TicketView } from "../TicketView";
import { SubTickets } from "./SubTickets";

beforeEach(() => {
	localStorage.clear();
	useComposerStore.setState({ open: false, options: {} });
});

const mount = (identifier = "CDE-42", server: FakeServer = createFakeServer()) =>
	renderTicket(identifier, (ticket) => <SubTickets ticket={ticket} />, { path: "/p/CDE", server });

const section = () => screen.findByRole("region", { name: /Sub-tickets/ });
const rows = (element: HTMLElement) => within(element).getAllByRole("button", { name: /CDE-\d+/ });

// An open PR with two passing checks on the child CDE-50.
const linkPrToChild = (server: FakeServer) => {
	const child = findTicket(server.state, "CDE-50")!;
	const pr: PullRequest = {
		id: ulid(),
		owner: "canary-technologies-corp",
		repo: "de",
		number: 123,
		url: "https://github.com/canary-technologies-corp/de/pull/123",
		title: "Rename a tab on double click",
		state: "open",
		isDraft: false,
		headRef: "cde-50-rename-tab",
		baseRef: "main",
		reviewState: "none",
		mergedAt: null,
		closedAt: null,
		checks: [
			{ name: "lint", workflow: "ci", bucket: "pass", link: null },
			{ name: "test", workflow: "ci", bucket: "pass", link: null },
		],
		ciState: "pass",
		fetchedAt: ago(hour),
		fetchError: null,
		createdAt: ago(hour),
		updatedAt: ago(hour),
	};
	server.state.prs.set(pr.id, pr);
	server.state.prLinks.push({
		ticketId: child.id,
		prId: pr.id,
		source: "auto",
		linkedBy: { name: "trellis", kind: "system" },
		linkedAt: ago(hour),
	});
};

describe("features/ticket/SubTickets", () => {
	// WT-58. CDE-48 and CDE-49 are done; CDE-50 is todo.
	test("shows the done count and the matching progress fill", async () => {
		mount();
		const element = await section();
		expect(element.textContent).toContain("2/3");
		expect(element.textContent).not.toContain("·");
		const bar = within(element).getByRole("progressbar");
		expect(bar.getAttribute("aria-valuenow")).toBe("2");
		expect(bar.getAttribute("aria-valuemax")).toBe("3");
		const fill = bar.querySelector<HTMLElement>("[data-fill]")!;
		const width = Number.parseFloat(fill.style.width);
		expect(width).toBeGreaterThan(66);
		expect(width).toBeLessThan(67);
	});

	// WT-59. One row per child; each row is the same fixed height.
	test("renders fixed-height rows with status, ID, title, priority, and PR", async () => {
		const server = createFakeServer();
		linkPrToChild(server);
		mount("CDE-42", server);
		const element = await section();
		const all = rows(element);
		expect(all).toHaveLength(3);
		const heights = new Set(all.map((entry) => /\bh-\d+\b/.exec(entry.className)?.[0]));
		expect(heights.size).toBe(1);
		expect([...heights][0]).toBeDefined();
		const last = within(element).getByRole("button", { name: /CDE-50/ });
		expect(last.querySelector('svg[data-category="todo"]')).not.toBeNull();
		expect(within(last).getByText("CDE-50").className).toMatch(/\bfont-mono\b/);
		expect(last.textContent).toContain("Terminals page: rename a tab on double click");
		expect(within(last).getByRole("img", { name: "Priority: low" })).toBeDefined();
		expect(within(last).getByLabelText(/ PR, checks /)).toBeDefined();
		const first = within(element).getByRole("button", { name: /CDE-48/ });
		expect(first.querySelector('svg[data-category="done"]')).not.toBeNull();
	});

	// WT-60
	test("a child row opens in the same surface", async () => {
		const user = userEvent.setup();
		const { router } = renderTicket("CDE-42", (ticket) => <SubTickets ticket={ticket} />, {
			path: "/p/CDE?peek=CDE-42",
		});
		await user.click(within(await section()).getByRole("button", { name: /CDE-48/ }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ peek: "CDE-48" }));
		expect(router.state.location.pathname).toBe("/p/CDE");
	});

	// Add hands the work to the create dialog, with this ticket as the
	// parent, so a sub-ticket takes every field a ticket takes.
	test("Add opens the create dialog with this ticket as the parent", async () => {
		const user = userEvent.setup();
		mount("CDE-42", createFakeServer());
		const element = await section();
		await user.click(within(element).getByRole("button", { name: "Add" }));
		await waitFor(() => expect(useComposerStore.getState().open).toBe(true));
		expect(useComposerStore.getState().options.parent).toBe("CDE-42");
	});

	// The section is always there, so a ticket with no children says so and
	// still offers Add.
	test("a ticket with no children shows the empty line and Add", async () => {
		renderTicket("CDE-47", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
			path: "/t/CDE-47",
		});
		const element = await section();
		expect(within(element).getByText("No sub-tickets yet.")).toBeDefined();
		expect(within(element).getByRole("button", { name: "Add" })).toBeDefined();
	});
});
