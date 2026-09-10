import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { callsTo, firstPr, ghReady, summaryOf } from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { PrActions } from "./PrActions";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const renderActions = async (server: FakeServer) => {
	const ticket = await summaryOf(server, "CDE-42");
	const pr = await firstPr(server, "CDE-42");
	renderWithProviders(<PrActions ticket={ticket} pr={pr} />, { path: "/t/CDE-42", actor: "navid", server });
	return { ticket, pr };
};

// Opens the menu from the keyboard. The trigger takes focus and Enter opens it.
const openMenu = async () => {
	const user = userEvent.setup();
	const trigger = await screen.findByRole("button", { name: "PR actions" });
	trigger.focus();
	await user.keyboard("{Enter}");
	return user;
};

// Opens the menu from the keyboard and runs the item named `label` with Enter.
const runItem = async (label: string) => {
	const user = await openMenu();
	const item = await screen.findByRole("menuitem", { name: label });
	item.focus();
	await user.keyboard("{Enter}");
};

describe("PrActions", () => {
	test("opens by keyboard and lists every row action", async () => {
		await renderActions(createFakeServer());
		await openMenu();
		const items = await screen.findAllByRole("menuitem");
		expect(items.map((item) => item.textContent!.trim())).toEqual(["Open on GitHub", "Copy link", "Refresh", "Remove"]);
	});

	test("Open on GitHub opens the pull request in a new tab", async () => {
		const open = spyOn(window, "open").mockImplementation(() => null);
		const { pr } = await renderActions(createFakeServer());
		await runItem("Open on GitHub");
		expect(open).toHaveBeenCalledWith(pr.url, "_blank", "noopener");
		open.mockRestore();
	});

	test("Copy link writes the pull request URL to the clipboard", async () => {
		const { pr } = await renderActions(createFakeServer());
		await runItem("Copy link");
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(pr.url));
	});

	// The seed reports gh as missing, and a refresh needs gh.
	test("Refresh refreshes this pull request", async () => {
		const server = createFakeServer();
		ghReady(server);
		const { pr } = await renderActions(server);
		await runItem("Refresh");
		await waitFor(() => expect(callsTo(server, "pullRequests.refresh")).toHaveLength(1));
		expect(callsTo(server, "pullRequests.refresh")[0]!.input).toEqual({ id: pr.id });
	});

	test("Remove removes the pull request from this ticket", async () => {
		const server = createFakeServer();
		const { ticket, pr } = await renderActions(server);
		await runItem("Remove");
		await waitFor(() => expect(callsTo(server, "pullRequests.unlink")).toHaveLength(1));
		expect(callsTo(server, "pullRequests.unlink")[0]!.input).toEqual({ ticket: ticket.id, id: pr.id });
		expect(server.state.prLinks.some((link) => link.ticketId === ticket.id && link.prId === pr.id)).toBe(false);
	});
});
