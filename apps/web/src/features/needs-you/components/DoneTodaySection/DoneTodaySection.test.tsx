import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { lastCallTo, rowOf, statusOf } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { DoneTodaySection } from "./DoneTodaySection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<DoneTodaySection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

const header = () => screen.findByRole("button", { name: /^Done by agents today/ });

describe("DoneTodaySection", () => {
	// NY-40. The section is awareness, not work, so it stays out of the way.
	test("starts collapsed and offers Show 6", async () => {
		render(createFakeServer());
		const control = await header();
		expect(control.getAttribute("aria-expanded")).toBe("false");
		expect(control.textContent).toContain("6");
		expect(control.textContent).toContain("Show 6");
		expect(screen.queryAllByRole("row")).toHaveLength(0);
	});

	// NY-41. The choice outlives the render, so a page visit keeps it.
	test("keeps the expanded state across a remount", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const first = render(server);
		await user.click(await header());
		await waitFor(() => expect(screen.getAllByRole("row").length).toBe(6));
		first.unmount();
		render(server);
		expect((await header()).getAttribute("aria-expanded")).toBe("true");
		await waitFor(() => expect(screen.getAllByRole("row").length).toBe(6));
	});

	// NY-42. An agent finished it; a person can put it back.
	test("reopens a row into the lowest-position todo status", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		const item = inbox.doneByAgentsToday.items[0]!;
		const identifier = item.identifier;
		// A reopen keeps the ticket in its own project. Todo is the
		// lowest-position status of the todo category in every seeded project.
		const todo = await statusOf(server, item.project.id, "todo");
		render(server);
		await user.click(await header());
		const row = await rowOf(identifier);
		await user.click(row.querySelector<HTMLButtonElement>("button[data-reopen]")!);
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: identifier, status: todo.id });
		await waitFor(() => expect(screen.queryByText(identifier)).toBeNull());
	});
});
