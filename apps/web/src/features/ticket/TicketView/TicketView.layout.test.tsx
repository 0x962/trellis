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

test("the peek uses a bounded main column beside the property rail", async () => {
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
	expect(rail.className).toMatch(/\bsticky\b/);
	expect(rail.className).toMatch(/\btop-0\b/);
	expect(body.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});

test("the peek keeps review actions in a separate row from navigation", async () => {
	mountPeek();
	const approve = await screen.findByRole("button", { name: /^Approve/ });
	const header = screen.getByLabelText("Ticket header");
	expect(header.contains(approve)).toBe(false);
	expect(within(header).getByRole("button", { name: "Close" })).toBeDefined();
	expect(within(header).getByRole("button", { name: "Expand to the full page" })).toBeDefined();
	const actions = screen.getByRole("group", { name: "Ticket actions" });
	expect(actions.contains(approve)).toBe(true);
});

test("the peek shows all properties in the right rail", async () => {
	mountPeek();
	const properties = await screen.findByLabelText("Properties");
	expect(within(properties).getByText("Status")).toBeDefined();
	expect(within(properties).getByText("Priority")).toBeDefined();
	expect(within(properties).getByText("Branch")).toBeDefined();
	expect(within(properties).getByText("Created")).toBeDefined();
	expect(within(properties).getByRole("button", { name: "Copy branch name" })).toBeDefined();
});
