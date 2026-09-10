import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dragFilesOver, dropFiles, fileOf, surfaceOf } from "../../../../test/attachments";
import { createFakeServer } from "../../../../test/fake-server";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { fieldValue, renderTicket, settle } from "../../../../test/ticketHost";
import { TicketView } from "./TicketView";

beforeEach(() => localStorage.clear());

const skeletons = () => [...document.querySelectorAll<HTMLElement>('[aria-busy="true"]')];

const page = (identifier = "CDE-42") =>
	renderTicket(identifier, (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
		path: `/t/${identifier}`,
	});

describe("features/ticket/TicketView", () => {
	// WT-16. The seeded CDE-42 has a parent, three children, one PR, one
	// attachment, and a timeline, so every section renders.
	test("renders every section of the seeded CDE-42", async () => {
		page();
		const header = await screen.findByLabelText("Ticket header");
		expect(within(header).queryByText("CDE-42")).toBeNull();
		expect(
			screen.getAllByText("CDE-42").some((element) => element.closest("header, [aria-label='Ticket header']") === null),
		).toBe(true);
		expect(within(header).getByRole("button", { name: "Start with agent" })).toBeDefined();
		const field = screen.getByRole("textbox", { name: "Title" });
		await waitFor(() => expect(fieldValue(field)).toBe("Restore the fork pages after the upstream 1.27 merge"));
		await waitFor(() => expect(document.querySelector(".markdown")!.textContent).toContain("1.27"));
		for (const name of ["Sub-tickets", "PRs", "Attachments", "Timeline"]) {
			expect(await screen.findByRole("region", { name: new RegExp(`^${name}`) })).toBeDefined();
		}
		expect(screen.getByRole("button", { name: /CDE-48/ })).toBeDefined();
		expect(screen.getByRole("button", { name: /#118/ })).toBeDefined();
		expect(screen.getByRole("img", { name: /fork-pages-after-merge\.png/ })).toBeDefined();
		expect(await screen.findByRole("list", { name: "Timeline" })).toBeDefined();
		const rail = screen.getByLabelText("Properties");
		expect(rail.tagName).toBe("ASIDE");
		expect(within(rail).getByText("Human Review")).toBeDefined();
	});

	// MB-C. Below 768 px the rail folds into the grid under the title, the
	// header keeps Back, the ID, and the more menu, and Start with agent goes
	// full width under the grid.
	test("a phone-width page folds the rail and moves Start with agent under the grid", async () => {
		mockMatchMedia(true);
		try {
			page();
			const header = await screen.findByLabelText("Ticket header");
			expect(within(header).getByText("CDE-42")).toBeDefined();
			expect(within(header).getByRole("link", { name: "Back to list" })).toBeDefined();
			expect(within(header).getByRole("button", { name: "More actions" })).toBeDefined();
			expect(within(header).queryByRole("button", { name: "Start with agent" })).toBeNull();
			const grid = await screen.findByLabelText("Properties");
			expect(grid.tagName).toBe("DL");
			const start = screen.getByRole("button", { name: "Start with agent" });
			expect(grid.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
			expect(start.closest("[data-phone-actions]")).not.toBeNull();
		} finally {
			// The mock is global to the test process, so the next file must not
			// inherit a phone-width window.
			mockMatchMedia(false);
		}
	});

	// WT-108. A hover-revealed action on the PR row has a twin in the row's
	// more menu, and Tab reaches that menu.
	test("no ticket action is hover-only", async () => {
		const user = userEvent.setup();
		page();
		const row = await screen.findByRole("button", { name: /#118/ });
		const hoverActions = [...row.parentElement!.querySelectorAll<HTMLElement>('[class*="group-hover"]')]
			.map((element) => element.getAttribute("aria-label") ?? element.textContent!.trim())
			.filter((name) => name !== "");
		expect(hoverActions.length).toBeGreaterThan(0);
		row.focus();
		let menuButton: HTMLElement | null = null;
		for (let step = 0; step < 6 && menuButton === null; step++) {
			await user.tab();
			const active = document.activeElement as HTMLElement;
			if (/actions/i.test(active.getAttribute("aria-label") ?? "")) menuButton = active;
		}
		expect(menuButton).not.toBeNull();
		await user.keyboard("{Enter}");
		const items = await screen.findAllByRole("menuitem");
		const names = items.map((item) => item.textContent!.trim());
		for (const name of hoverActions) expect(names).toContain(name);
		for (const item of items) {
			item.focus();
			expect(document.activeElement).toBe(item);
		}
	});

	// WT-110. A skeleton is shaped like the row it stands for: a PR row is
	// 56 px (h-14), an activity line 32 px (h-8). A cached open paints at once.
	test("shows skeletons cold and none on a cached open", async () => {
		const server = createFakeServer();
		const hold = server.holdNext("tickets.get");
		setTimeout(hold.release, 400);
		const cold = renderWithProviders(<TicketView identifier="CDE-42" variant="page" />, {
			path: "/t/CDE-42",
			actor: "navid",
			server,
		});
		await waitFor(() => expect(skeletons().length).toBeGreaterThan(0));
		const classes = skeletons().flatMap((root) => [...root.querySelectorAll("*")].map((el) => el.className));
		expect(classes.some((name) => /\bh-14\b/.test(name))).toBe(true);
		expect(classes.some((name) => /\bh-8\b/.test(name))).toBe(true);
		await waitFor(() => expect(skeletons()).toHaveLength(0), { timeout: 2000 });
		const key = cold.orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		const data = cold.queryClient.getQueryData(key);
		cold.unmount();
		let seen = 0;
		const observer = new MutationObserver(() => {
			seen += skeletons().length;
		});
		observer.observe(document.body, { subtree: true, childList: true });
		renderWithProviders(<TicketView identifier="CDE-42" variant="page" />, {
			path: "/t/CDE-42",
			actor: "navid",
			server,
			prime: ({ queryClient }) => queryClient.setQueryData(key, data),
		});
		expect(skeletons()).toHaveLength(0);
		await screen.findByLabelText("Ticket header");
		await settle();
		observer.disconnect();
		expect(seen).toBe(0);
	});

	// WT-111. Fixed row heights: text length never changes a row.
	test("keeps the fixed row heights of the spec", async () => {
		const server = createFakeServer();
		const long = await server.client.tickets.get({ ticket: "CDE-42" });
		const link = server.state.prLinks.find((entry) => entry.ticketId === long.id)!;
		server.state.prs.get(link.prId)!.title = "A pull request title that runs far past the width of the row ".repeat(4);
		renderTicket("CDE-42", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
			path: "/t/CDE-42",
			server,
		});
		const prRow = await screen.findByRole("button", { name: /#118/ });
		expect(prRow.closest(".h-14")).not.toBeNull();
		const timeline = await screen.findByRole("list", { name: "Timeline" });
		await waitFor(() => expect(timeline.querySelectorAll('[data-kind="activity"]').length).toBeGreaterThan(0));
		for (const line of timeline.querySelectorAll<HTMLElement>('[data-kind="activity"]')) {
			expect(line.className).toMatch(/\bh-8\b/);
		}
		const children = screen.getByRole("region", { name: /Sub-tickets/ });
		const heights = new Set(
			within(children)
				.getAllByRole("button", { name: /CDE-\d+/ })
				.map((row) => /\bh-\d+\b/.exec(row.className)?.[0]),
		);
		expect(heights.size).toBe(1);
	});

	// WT-75. The whole ticket is one drop target, on the page and in the peek.
	// One overlay names the ticket, and a drop uploads the files to it.
	test("a drop anywhere on the ticket uploads the files to that ticket", async () => {
		for (const variant of ["page", "peek"] as const) {
			const view = renderTicket("CDE-42", (ticket) => <TicketView identifier={ticket.identifier} variant={variant} />, {
				path: "/t/CDE-42",
			});
			const surface = await screen.findByRole("article");
			fireEvent.dragEnter(surface, { dataTransfer: filesTransfer() });
			expect(await screen.findByText("Drop to attach to CDE-42")).toBeDefined();
			dragFilesOver(await surfaceOf());
			expect(screen.getAllByText(/Drop to attach to CDE-42/), variant).toHaveLength(1);
			dropFiles(surface, [fileOf("trace.txt", "text/plain", 64)]);
			await waitFor(() => expect(screen.queryByText(/Drop to attach to CDE-42/)).toBeNull());
			await waitFor(() => expect(view.server.callsTo("attachments.upload"), variant).toHaveLength(1));
			expect(view.server.callsTo("attachments.upload")[0]!.input, variant).toMatchObject({ ticket: "CDE-42" });
			view.unmount();
		}
	});
});

const filesTransfer = () => ({ types: ["Files"], files: [], items: [] });
