import { beforeEach, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TicketView } from "./TicketView";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mountPeek = () =>
	renderWithProviders(<TicketView identifier="CDE-42" variant="peek" />, {
		path: "/p/CDE?peek=CDE-42",
		actor: "navid",
	});

test("the peek header spans the body and the full-height property rail", async () => {
	mountPeek();
	const title = await screen.findByRole("textbox", { name: "Title" });
	const body = title.closest<HTMLElement>("[data-ticket-content]")!;
	expect(body).not.toBeNull();
	expect(body.classList.contains("w-full")).toBe(true);
	expect(body.classList.contains("max-w-[856px]")).toBe(true);
	const header = screen.getByLabelText("Ticket header");
	expect(within(header).getByText("CDE-42")).toBeDefined();
	expect(within(body).queryByText("CDE-42")).toBeNull();
	const rail = screen.getByLabelText("Properties");
	expect(rail.tagName).toBe("ASIDE");
	const columns = body.closest<HTMLElement>("[data-ticket-columns]")!;
	expect(columns).not.toBeNull();
	expect(columns.contains(header)).toBe(false);
	expect(header.compareDocumentPosition(columns) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
	expect(columns.contains(rail)).toBe(true);
	expect(rail.className).toMatch(/\bh-full\b/);
});

test("the description keeps a minimum reading area", async () => {
	mountPeek();
	await screen.findByRole("textbox", { name: "Title" });
	const description = document.querySelector<HTMLElement>("[data-ticket-description]")!;
	expect(description).not.toBeNull();
	expect(description.className).toMatch(/\bmin-h-24\b/);
});

test("the peek keeps navigation without an approval bar", async () => {
	mountPeek();
	await screen.findByRole("textbox", { name: "Title" });
	const header = screen.getByLabelText("Ticket header");
	expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
	expect(within(header).getByRole("button", { name: "Close" })).toBeDefined();
	expect(within(header).getByRole("button", { name: "Expand to the full page" })).toBeDefined();
	expect(screen.queryByRole("group", { name: "Ticket actions" })).toBeNull();
});

// The rail holds the pickers alone. The branch copies from the header, the
// sub-tickets have their own section, and the times read in the activity.
test("the peek rail holds the picker rows and nothing else", async () => {
	mountPeek();
	const properties = await screen.findByLabelText("Properties");
	expect(within(properties).getByText("Status")).toBeDefined();
	expect(within(properties).getByText("Priority")).toBeDefined();
	expect(within(properties).queryByText("Branch")).toBeNull();
	expect(within(properties).queryByText("Created")).toBeNull();
	expect(within(properties).queryByText("Sub-tickets")).toBeNull();
});
