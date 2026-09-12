import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useComposerStore } from "../../../../../../src/features/composer";
import { SubTickets } from "../../../../../../src/features/ticket/SubTickets/SubTickets";
import { TicketView } from "../../../../../../src/features/ticket/TicketView";
import { linkPrCopy, patchPr } from "../../../../../prs";
import { createTestServer, type TestServer } from "../../../../../server";
import { ago, hour, renderTicket } from "../../../../../ticketHost";

beforeEach(() => {
	localStorage.clear();
	useComposerStore.setState({ open: false, options: {} });
});

const mount = (identifier = "CDE-42", server: TestServer = createTestServer()) =>
	renderTicket(identifier, (ticket) => <SubTickets ticket={ticket} />, { path: "/p/CDE", server });

const section = () => screen.findByRole("region", { name: /Sub-tickets/ });
const rows = (element: HTMLElement) => within(element).getAllByRole("button", { name: /CDE-\d+/ });

// An open PR with two passing checks on the child CDE-50. It is copied from
// the one CDE-42 holds, so the seed's repository answers for it.
const linkPrToChild = async (server: TestServer) => {
	const pr = await linkPrCopy(server, "CDE-42", {
		number: 123,
		title: "Rename a tab on double click",
		headRef: "cde-50-rename-tab",
		checks: [
			{ name: "lint", workflow: "ci", bucket: "pass", link: null },
			{ name: "test", workflow: "ci", bucket: "pass", link: null },
		],
	});
	await server.client.pullRequests.unlink({ ticket: "CDE-42", id: pr.id });
	await server.client.pullRequests.link({ ticket: "CDE-50", url: pr.url });
	await patchPr(server, pr.id, { fetchedAt: ago(hour), createdAt: ago(hour), updatedAt: ago(hour) });
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
		const server = createTestServer();
		await linkPrToChild(server);
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
		mount("CDE-42");
		const element = await section();
		await user.click(within(element).getByRole("button", { name: "Add" }));
		await waitFor(() => expect(useComposerStore.getState().open).toBe(true));
		expect(useComposerStore.getState().options.parent).toBe("CDE-42");
	});

	// Nothing to frame, so no frame: one quiet word, and Add carries the
	// invitation.
	test("a ticket with no children shows one quiet word and Add", async () => {
		renderTicket("CDE-47", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
			path: "/t/CDE-47",
		});
		const element = await section();
		expect(within(element).getByText("empty")).toBeDefined();
		expect(element.querySelector(".border-border")).toBeNull();
		expect(within(element).getByRole("button", { name: "Add" })).toBeDefined();
	});
});
