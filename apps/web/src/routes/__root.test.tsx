import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";
import { createTestServer } from "../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("routes/__root", () => {
	// WS-65
	test("the root shell renders the sidebar, live provider, toaster, palette slot, and outlet", async () => {
		renderApp({ path: "/needs-you", actor: "dana" });
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
		expect(sidebar.tagName).toBe("ASIDE");
		expect(screen.queryByRole("status", { name: "Server connection" })).toBeNull();
		expect(document.querySelector('section[aria-label^="Notifications"]')).not.toBeNull();
		expect(document.querySelector("[data-command-palette]")).not.toBeNull();
		fireEvent.keyDown(document.body, { key: "g" });
		expect(screen.getByText("g…")).toBeDefined();
		fireEvent.keyDown(document.body, { key: "Escape" });
	});

	// WS-66. A server with projects or a stored name has an identity, so only
	// the empty server stands for "no identity".
	test("no identity redirects to /setup", async () => {
		const { router } = renderApp({ path: "/needs-you", server: createTestServer({ empty: true }) });
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup"));
		expect(await screen.findByRole("heading", { name: "Enter your name" })).toBeDefined();
		expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
	});

	// WS-67. An identity without a project lands on the project step. The
	// step is a search param, so the same form serves a later new project.
	test("no project redirects to /setup step 2", async () => {
		const { router } = renderApp({ path: "/all", actor: "dana", server: createTestServer({ empty: true }) });
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup"));
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect((router.state.location.search as { step?: string }).step).toBe("project");
	});

	// The URL changes when a navigation starts, and the outlet changes when
	// the new route has loaded. The layout must follow the outlet, or the
	// setup card shows inside the shell while the project page loads.
	test("the setup card never renders inside the shell while the next page loads", async () => {
		const { router, server } = renderApp({ path: "/setup?step=project", actor: "dana" });
		const hold = server.holdNext("projects.get");
		fireEvent.change(await screen.findByRole("textbox", { name: "Project name" }), { target: { value: "Held" } });
		fireEvent.click(screen.getByRole("button", { name: /^Create/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/HE"));

		expect(screen.getByRole("heading", { name: "New project" })).toBeDefined();
		expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();

		act(() => hold.release());
		expect(await screen.findByRole("complementary", { name: "Sidebar" })).toBeDefined();
		await waitFor(() => expect(screen.queryByRole("heading", { name: "New project" })).toBeNull());
	});

	// ER-3. The URL changes when a navigation starts. The sidebar marks the
	// page the outlet shows, so the highlight never runs ahead of the page.
	test("the sidebar keeps the shown page highlighted while the next page loads", async () => {
		const { router, server } = renderApp({ path: "/needs-you", actor: "dana" });
		const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
		const needsYou = within(sidebar).getByRole("link", { name: /Needs you/ });
		const all = within(sidebar).getByRole("link", { name: /All tickets/ });
		await waitFor(() => expect(needsYou.className).toMatch(/\bsidebar-selected\b/));
		const hold = server.holdNext("tickets.counts");
		fireEvent.click(all);
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
		expect(needsYou.className).toMatch(/\bsidebar-selected\b/);
		expect(all.className).not.toMatch(/\bsidebar-selected\b/);
		act(() => hold.release());
		await waitFor(() => expect(all.className).toMatch(/\bsidebar-selected\b/));
		expect(needsYou.className).not.toMatch(/\bsidebar-selected\b/);
	});

	// WS-68
	test("a finished setup redirects /setup to /needs-you", async () => {
		const { router } = renderApp({ path: "/setup", actor: "dana" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
	});

	test("the sidebar alone shows reconnecting and restarting status", async () => {
		const { live } = renderApp({ path: "/needs-you", actor: "dana", liveStatus: "reconnecting" });
		const panel = await screen.findByRole("status", { name: "Server connection" });
		const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
		expect(sidebar.contains(panel)).toBe(true);
		expect(within(panel).getByText("Reconnecting")).toBeDefined();
		expect(screen.queryByText("Reconnecting to the server…")).toBeNull();
		act(() => live.status.set("restarting"));
		expect(within(panel).getByText("Restarting")).toBeDefined();
		expect(screen.queryByText("Server restarting")).toBeNull();
	});

	test("offline status stays in the sidebar without a header overlay", async () => {
		renderApp({ path: "/needs-you", actor: "dana", liveStatus: "down" });
		const panel = await screen.findByRole("status", { name: "Server connection" });
		expect(within(panel).getByText("Server offline")).toBeDefined();
		expect(screen.getByRole("complementary", { name: "Sidebar" }).contains(panel)).toBe(true);
		expect(screen.queryByText("The server is offline. Start it with trellis serve.")).toBeNull();
	});

	// SH-10. A URL with no route shows the page-level empty state inside
	// the shell, in the deck's words, with a way back.
	test("an unknown URL shows the page-level not-found state in the shell", async () => {
		renderApp({ path: "/nowhere", actor: "dana" });
		const title = await screen.findByRole("heading", { name: "Page not found" });
		expect(screen.getByText("No page has this URL.")).toBeDefined();
		expect(title.parentElement!.className).toMatch(/pb-\[15vh\]/);
		const back = within(screen.getByRole("main")).getByRole("link", { name: "Needs you" });
		expect(back.className).toMatch(/\bh-8\b/);
		expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeDefined();
	});

	test("a restored connection clears the status without a header confirmation", async () => {
		const { live } = renderApp({ path: "/needs-you", actor: "dana", liveStatus: "reconnecting" });
		await screen.findByRole("status", { name: "Server connection" });
		act(() => live.status.set("live"));
		expect(screen.queryByRole("status", { name: "Server connection" })).toBeNull();
		expect(screen.queryByText("Reconnected")).toBeNull();
	});
});
