import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { conflictAt18, serverAt17 } from "../../../../test/conflict";
import type { FakeServer } from "../../../../test/fake-server";
import { fieldValue, renderTicket, settle } from "../../../../test/ticketHost";
import { Title } from "./Title";

beforeEach(() => localStorage.clear());

const stored = "Restore the fork pages after the upstream 1.27 merge";

const mount = (server: FakeServer = serverAt17()) =>
	renderTicket("CDE-42", (ticket) => <Title ticket={ticket} />, { path: "/t/CDE-42", server });

const field = () => screen.getByRole("textbox", { name: "Title" });

const ready = async () => {
	const element = await screen.findByRole("textbox", { name: "Title" });
	await waitFor(() => expect(fieldValue(element)).toBe(stored));
	return element;
};

const updates = (server: FakeServer) => server.callsTo("tickets.update");

describe("features/ticket/Title", () => {
	// WT-25
	test("Enter saves the title with expectedVersion", async () => {
		const user = userEvent.setup();
		const { server } = mount();
		const element = await ready();
		await user.clear(element);
		await user.type(element, "Restore every fork page{Enter}");
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		const input = updates(server)[0]!.input as Record<string, unknown>;
		expect(input.title).toBe("Restore every fork page");
		expect(input.expectedVersion).toBe(17);
		await waitFor(() => expect(document.activeElement).not.toBe(field()));
	});

	// WT-26
	test("Escape reverts the title and saves nothing", async () => {
		const user = userEvent.setup();
		const { server } = mount();
		const element = await ready();
		await user.clear(element);
		await user.type(element, "Something else{Escape}");
		await waitFor(() => expect(fieldValue(field())).toBe(stored));
		await settle();
		expect(updates(server)).toHaveLength(0);
	});

	// WT-27
	test("blur saves the title once", async () => {
		const user = userEvent.setup();
		const { server } = mount();
		const element = await ready();
		await user.clear(element);
		await user.type(element, "Restore every fork page");
		await user.tab();
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect((updates(server)[0]!.input as { title: string }).title).toBe("Restore every fork page");
		await settle();
		expect(updates(server)).toHaveLength(1);
	});

	// WT-28
	test("an empty title does not reach the server", async () => {
		const user = userEvent.setup();
		const { server } = mount();
		const element = await ready();
		await user.clear(element);
		await user.keyboard("{Enter}");
		await waitFor(() => expect(fieldValue(field())).toBe(stored));
		await settle();
		expect(updates(server)).toHaveLength(0);
	});

	// WT-29. The conflict names who changed the row and offers both exits.
	test("a 412 on the title shows the conflict notice with the actor", async () => {
		const user = userEvent.setup();
		const server = serverAt17();
		server.failNext("tickets.update", { code: "VERSION_CONFLICT", data: { current: await conflictAt18(server) } });
		mount(server);
		const element = await ready();
		await user.clear(element);
		await user.type(element, "Restore every fork page{Enter}");
		expect(await screen.findByText("changed by agent:claude-code: reload or overwrite")).toBeDefined();
		expect(screen.getByRole("button", { name: "Reload" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Overwrite" })).toBeDefined();
	});
});
