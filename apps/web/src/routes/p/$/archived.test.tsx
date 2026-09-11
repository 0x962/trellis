import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { callsTo, lastCallTo } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { tableViewport } from "../../../../test/viewport";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const installViewport = tableViewport();

const bannerText = "This project is archived. It is read-only.";

const archivedServer = async () => {
	const server = createFakeServer();
	await server.client.projects.update({ project: "MRG", archived: true });
	return server;
};

// The server refuses every write to an archived project, so its pages show
// why under a banner and offer no control that writes.
describe("routes/p/$ archived", () => {
	test("an archived project table is read-only under a banner", async () => {
		installViewport();
		const user = userEvent.setup();
		const server = await archivedServer();
		renderApp({ path: "/p/MRG/table", actor: "navid", server });
		expect(await screen.findByText(bannerText)).toBeDefined();
		// The status grouping hides the status column; the priority cell is a
		// write control on every row.
		const priority = (await screen.findAllByRole("button", { name: "Change priority" }))[0]!;
		await user.click(priority);
		expect(screen.queryByRole("option")).toBeNull();
		expect(callsTo(server, "tickets.update")).toHaveLength(0);
	});

	test("the banner unarchives the project", async () => {
		const user = userEvent.setup();
		const server = await archivedServer();
		renderApp({ path: "/p/MRG/table", actor: "navid", server });
		await screen.findByText(bannerText);
		await user.click(screen.getByRole("button", { name: "Unarchive" }));
		await waitFor(() =>
			expect(lastCallTo(server, "projects.update")?.input).toEqual({ project: "MRG", archived: false }),
		);
		await waitFor(() => expect(screen.queryByText(bannerText)).toBeNull());
	});

	test("archived project settings save nothing", async () => {
		const user = userEvent.setup();
		const server = await archivedServer();
		renderApp({ path: "/p/MRG/settings", actor: "navid", server });
		expect(await screen.findByText(bannerText)).toBeDefined();
		await user.click(await screen.findByRole("button", { name: "Save project" }));
		expect(callsTo(server, "projects.update")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Unarchive project" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Archive project" })).toBeNull();
	});

	test("an active project shows no banner", async () => {
		renderApp({ path: "/p/TRL/table", actor: "navid" });
		expect(await screen.findByRole("navigation", { name: "Breadcrumb" })).toBeDefined();
		expect(screen.queryByText(bannerText)).toBeNull();
	});
});
