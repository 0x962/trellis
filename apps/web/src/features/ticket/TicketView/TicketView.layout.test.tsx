import { beforeEach, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("the peek body fills the panel with equal compact side padding", async () => {
	mountPeek();
	const title = await screen.findByRole("textbox", { name: "Title" });
	const body = title.closest("[data-ticket-content]")!;
	expect(body).not.toBeNull();
	expect(body.classList.contains("w-full")).toBe(true);
	expect(body.classList.contains("px-6")).toBe(true);
	expect(body.className).not.toContain("max-w-");
});

test("the peek keeps review actions in a separate row from navigation", async () => {
	mountPeek();
	const start = await screen.findByRole("button", { name: "Start with agent" });
	const header = screen.getByLabelText("Ticket header");
	expect(header.contains(start)).toBe(false);
	expect(within(header).getByRole("button", { name: "Close" })).toBeDefined();
	expect(within(header).getByRole("button", { name: "Expand to the full page" })).toBeDefined();
	const actions = screen.getByRole("group", { name: "Ticket actions" });
	expect(actions.contains(start)).toBe(true);
	expect(within(actions).getByRole("button", { name: /^Approve/ })).toBeDefined();
});

test("the peek groups secondary properties behind a details disclosure", async () => {
	const user = userEvent.setup();
	mountPeek();
	const properties = await screen.findByLabelText("Properties");
	expect(within(properties).getByText("Status")).toBeDefined();
	expect(within(properties).getByText("Priority")).toBeDefined();
	const summary = within(properties).getByText("Details");
	const details = summary.closest("details")!;
	expect(details).not.toBeNull();
	expect(details.open).toBe(false);
	expect(within(details).getByText("Branch")).toBeDefined();
	expect(within(details).getByText("Created")).toBeDefined();
	await user.click(summary);
	expect(details.open).toBe(true);
	expect(within(details).getByRole("button", { name: "Copy branch name" })).toBeDefined();
});
