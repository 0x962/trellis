import { beforeEach, describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { ticketSummary } from "../../../../../test/fixtures";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { InboxRow } from "./InboxRow";

beforeEach(() => localStorage.clear());

const threeHoursAgo = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

// A ticket with every optional field the row can show.
const full = () =>
	ticketSummary({
		identifier: "CDE-42",
		title: "Restore the fork pages after the upstream 1.27 merge",
		parent: { id: "01J8Z6X4Q3M2K1H0G9F8E7D6T3", identifier: "CDE-43" },
		childCount: 4,
		childDoneCount: 1,
		commentCount: 2,
		pr: { state: "open", ciState: "pass", pass: 4, fail: 0, pending: 0 },
		updatedAt: threeHoursAgo(),
	}) as TicketSummary;

const row = (ticket: TicketSummary) =>
	renderWithProviders(<InboxRow ticket={ticket} />, { path: "/needs-you", actor: "navid" });

// The height class the row carries. happy-dom runs no layout, so the class
// that sets the height is what a test can compare.
const heightClass = (element: Element) =>
	(element.getAttribute("class") ?? "").split(/\s+/).find((name) => /^h-\d/.test(name));

describe("InboxRow", () => {
	// NY-07. Every mark the approved design puts on a Needs you row.
	test("renders id, title, parent, sub-ticket ring, counts, status, PR badge, and waiting time", () => {
		const ticket = full();
		const { container, getByText } = row(ticket);
		expect(container.querySelector('[data-category="review"]')).not.toBeNull();
		expect(getByText("CDE-42")).toBeDefined();
		expect(getByText(ticket.title as string)).toBeDefined();
		expect(getByText("↳ CDE-43")).toBeDefined();
		expect(container.querySelector("[data-sub-tickets]")?.textContent).toBe("1/4");
		expect(container.querySelector("[data-comment-count]")?.textContent).toBe("2");
		expect(getByText("Human Review")).toBeDefined();
		expect(container.querySelector('[data-pr-state="open"]')).not.toBeNull();
		expect(getByText("3h")).toBeDefined();
	});

	// NY-08. A pull request and a parent arrive after the first paint, so a
	// row that gains them must not push the rows under it.
	test("keeps one fixed row height with and without optional fields", () => {
		const rich = row(full());
		const richRow = rich.container.querySelector("[data-inbox-row]");
		expect(richRow).not.toBeNull();
		const bare = row(
			ticketSummary({ identifier: "CDE-51", parent: null, childCount: 0, commentCount: 0, pr: null }) as TicketSummary,
		);
		const bareRow = bare.container.querySelector("[data-inbox-row]");
		expect(heightClass(richRow!)).toBeDefined();
		expect(heightClass(bareRow!)).toBe(heightClass(richRow!));
	});
});
