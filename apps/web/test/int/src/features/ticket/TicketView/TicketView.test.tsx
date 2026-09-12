import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dragFilesOver, dropFiles, fileOf, surfaceOf } from "../../../../../attachments";
import { mockMatchMedia } from "../../../../../media";
import { patchPr } from "../../../../../prs";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";
import { fieldValue, renderTicket, settle } from "../../../../../ticketHost";
import { TicketView } from "../../../../../../src/features/ticket/TicketView/TicketView";

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

	// Below 768 px the properties form a grid under the title.
	test("a phone-width page folds the rail without an approval bar", async () => {
		mockMatchMedia(true);
		try {
			page();
			const header = await screen.findByLabelText("Ticket header");
			expect(within(header).getByText("CDE-42")).toBeDefined();
			expect(within(header).getByRole("link", { name: "Back to list" })).toBeDefined();
			expect(within(header).getByRole("button", { name: "More actions" })).toBeDefined();
			const grid = await screen.findByLabelText("Properties");
			expect(grid.tagName).toBe("DL");
			expect(document.querySelector("[data-phone-actions]")).toBeNull();
			expect(screen.queryByRole("button", { name: /^Approve|^Send back/ })).toBeNull();
		} finally {
			// The mock is global to the test process, so the next file must not
			// inherit a phone-width window.
			mockMatchMedia(false);
		}
	});

	// WT-108. Every hover-revealed action on the PR card has a focus twin, and
	// Tab stops on each one in card order, so the keyboard reaches every
	// action the pointer reaches.
	test("no ticket action is hover-only", async () => {
		const user = userEvent.setup();
		page();
		const section = await screen.findByRole("region", { name: /^PRs/ });
		const card = await waitFor(() => {
			const found = section.querySelector<HTMLElement>("[data-pr-row]");
			if (found === null) throw new Error("The PRs section holds no card.");
			return found;
		});
		const hoverActions = [...card.querySelectorAll<HTMLElement>('[class*="group-hover:opacity-100"]')];
		expect(hoverActions.length).toBeGreaterThan(0);
		for (const action of hoverActions) expect(action.className).toMatch(/focus-visible:opacity-100/);
		const names = hoverActions.map((action) => action.getAttribute("aria-label"));
		// The diff link leads the card, so a Tab from it walks the controls
		// that follow it on the card.
		(await within(card).findByRole("link")).focus();
		const reached: (string | null)[] = [];
		for (let step = 0; step < 6 && reached.length < hoverActions.length; step++) {
			await user.tab();
			const active = document.activeElement as HTMLElement;
			if (hoverActions.includes(active)) reached.push(active.getAttribute("aria-label"));
		}
		expect(reached).toEqual(names);
	});

	// WT-110. A skeleton is shaped like the row it stands for: a PR row is
	// 56 px (h-14), an activity line 32 px (h-8). A cached open paints at once.
	test("shows skeletons cold and none on a cached open", async () => {
		const server = createTestServer();
		const hold = server.holdNext("tickets.get");
		setTimeout(hold.release, 400);
		const cold = renderWithProviders(<TicketView identifier="CDE-42" variant="page" />, {
			path: "/t/CDE-42",
			actor: "dana",
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
			actor: "dana",
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
		const server = createTestServer();
		const long = await server.client.tickets.get({ ticket: "CDE-42" });
		await patchPr(server, long.prs[0]!.id, {
			title: "A pull request title that runs far past the width of the row ".repeat(4),
		});
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
