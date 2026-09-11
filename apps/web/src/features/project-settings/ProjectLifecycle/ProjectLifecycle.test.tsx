import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lastCallTo } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { formatCount } from "../../../lib/format";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const ticketsUnder = async (server: TestServer, key: string) =>
	(await server.client.tickets.counts({ project: key })).total;

const projectTree = () => screen.getByRole("navigation", { name: "Projects" });

describe("features/project-settings/ProjectLifecycle", () => {
	test("project settings archive the project and unarchive it", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/TRL/settings", actor: "navid" });
		await user.click(await screen.findByRole("button", { name: "Archive project" }));
		await waitFor(() =>
			expect(lastCallTo(server, "projects.update")?.input).toEqual({ project: "TRL", archived: true }),
		);
		expect(await screen.findByText("This project is archived. It is read-only.")).toBeDefined();
		await user.click(await screen.findByRole("button", { name: "Unarchive project" }));
		await waitFor(() =>
			expect(lastCallTo(server, "projects.update")!.input).toEqual({ project: "TRL", archived: false }),
		);
		await waitFor(() => expect(screen.queryByText("This project is archived. It is read-only.")).toBeNull());
		expect(await screen.findByRole("button", { name: "Archive project" })).toBeDefined();
	});

	// A delete with tickets removes them for good, so the dialog states the
	// count and waits for the key before it sends `force`.
	test("delete states the ticket count, takes the typed key, and sends force", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const count = await ticketsUnder(server, "TRL");
		expect(count).toBeGreaterThan(1);
		const { router } = renderApp({ path: "/p/TRL/settings", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete project…" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete trellis?" });
		await waitFor(() => expect(dialog.textContent).toContain(`${formatCount(count)} tickets`));
		const confirm = within(dialog).getByRole("button", { name: "Delete project" });
		expect(confirm.hasAttribute("disabled")).toBe(true);
		const key = within(dialog).getByRole("textbox", { name: "Type TRL to confirm" });
		await user.type(key, "TR");
		expect(confirm.hasAttribute("disabled")).toBe(true);
		await user.type(key, "L");
		expect(confirm.hasAttribute("disabled")).toBe(false);
		await user.click(confirm);
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
		expect(lastCallTo(server, "projects.delete")!.input).toEqual({ project: "TRL", force: true });
		await waitFor(() => expect(within(projectTree()).queryByRole("link", { name: /trellis/ })).toBeNull());
		expect((await server.client.projects.list({})).some((project) => project.key === "TRL")).toBe(false);
	});

	test("delete of an empty project asks once and sends projects.delete without force", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await server.client.projects.create({ key: "EMP", name: "Empty" });
		const { router } = renderApp({ path: "/p/EMP/settings", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete project…" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete Empty?" });
		await waitFor(() => expect(dialog.textContent).toContain("no tickets"));
		expect(within(dialog).queryByRole("textbox")).toBeNull();
		await user.click(within(dialog).getByRole("button", { name: "Delete project" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
		expect(lastCallTo(server, "projects.delete")!.input).toEqual({ project: "EMP" });
		await waitFor(() => expect(within(projectTree()).queryByRole("link", { name: /Empty/ })).toBeNull());
	});
});
