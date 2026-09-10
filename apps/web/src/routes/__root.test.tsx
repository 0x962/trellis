import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakeServer } from "../../test/fake-server";
import { createFakeScheduler } from "../../test/fakeScheduler";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("routes/__root", () => {
	// WS-65
	test("the root shell renders the sidebar, live provider, toaster, palette slot, and outlet", async () => {
		renderApp({ path: "/needs-you", actor: "navid" });
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
		expect(sidebar.tagName).toBe("ASIDE");
		expect(screen.getByLabelText("Online")).toBeDefined();
		expect(document.querySelector('section[aria-label^="Notifications"]')).not.toBeNull();
		expect(document.querySelector("[data-command-palette]")).not.toBeNull();
		fireEvent.keyDown(document.body, { key: "g" });
		expect(screen.getByText("g…")).toBeDefined();
		fireEvent.keyDown(document.body, { key: "Escape" });
	});

	// WS-66. A server with projects or a stored name has an identity, so only
	// the empty server stands for "no identity".
	test("no identity redirects to /setup", async () => {
		const { router } = renderApp({ path: "/needs-you", server: createFakeServer({ empty: true }) });
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup"));
		expect(await screen.findByRole("heading", { name: "What should we call you?" })).toBeDefined();
		expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
	});

	// WS-67. An identity without a project lands on the project step. The
	// step is a search param, so the same form serves a later new project.
	test("no project redirects to /setup step 2", async () => {
		const { router } = renderApp({ path: "/all", actor: "navid", server: createFakeServer({ empty: true }) });
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup"));
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect((router.state.location.search as { step?: string }).step).toBe("project");
	});

	// The URL changes when a navigation starts, and the outlet changes when
	// the new route has loaded. The layout must follow the outlet, or the
	// setup card shows inside the shell while the project page loads.
	test("the setup card never renders inside the shell while the next page loads", async () => {
		const { router, server } = renderApp({ path: "/setup?step=project", actor: "navid" });
		const hold = server.holdNext("projects.get");
		fireEvent.change(await screen.findByRole("textbox", { name: "Project name" }), { target: { value: "Held" } });
		fireEvent.click(screen.getByRole("button", { name: "Create" }));
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
		const { router, server } = renderApp({ path: "/needs-you", actor: "navid" });
		const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
		const needsYou = within(sidebar).getByRole("link", { name: /Needs you/ });
		const all = within(sidebar).getByRole("link", { name: /All tickets/ });
		await waitFor(() => expect(needsYou.className).toMatch(/\bbg-accent-soft\b/));
		const hold = server.holdNext("tickets.counts");
		fireEvent.click(all);
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
		expect(needsYou.className).toMatch(/\bbg-accent-soft\b/);
		expect(all.className).not.toMatch(/\bbg-accent-soft\b/);
		act(() => hold.release());
		await waitFor(() => expect(all.className).toMatch(/\bbg-accent-soft\b/));
		expect(needsYou.className).not.toMatch(/\bbg-accent-soft\b/);
	});

	// WS-68
	test("a finished setup redirects /setup to /needs-you", async () => {
		const { router } = renderApp({ path: "/setup", actor: "navid" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
	});

	// WS-69. The banner is text, so the state never relies on the dot's
	// color alone.
	test("the reconnect banner mirrors the live status", async () => {
		const { live } = renderApp({ path: "/needs-you", actor: "navid", liveStatus: "reconnecting" });
		const banner = await screen.findByText("Reconnecting to the server…");
		const region = banner.closest("[role=status]")!;
		expect(region).not.toBeNull();
		expect(region.className).toMatch(/warning/);
		act(() => live.status.set("restarting"));
		expect(screen.getByText("Server restarting").closest("[role=status]")!.className).toMatch(/warning/);
		act(() => live.status.set("live"));
		expect(screen.queryByText("Server restarting")).toBeNull();
		expect(screen.queryByText("Reconnecting to the server…")).toBeNull();
	});

	// SH-7. The state is a pill over the top of the pane. It never pushes
	// the page down, and the offline pill names the command that starts
	// the server.
	test("the reconnect state is a pill over the pane that moves nothing", async () => {
		const { live } = renderApp({ path: "/needs-you", actor: "navid", liveStatus: "reconnecting" });
		const pill = (await screen.findByText("Reconnecting to the server…")).closest("[role=status]")!;
		for (const name of [
			"absolute",
			"top-2.5",
			"left-1/2",
			"-translate-x-1/2",
			"z-20",
			"h-6",
			"rounded-full",
			"px-2.5",
			"text-xs",
		]) {
			expect(pill.classList.contains(name)).toBe(true);
		}
		expect(pill.className).toMatch(/\bbg-warning-soft\b/);
		const dot = pill.querySelector("[data-pulse]")!;
		for (const name of ["size-1.5", "rounded-full", "animate-pulse-live"])
			expect(dot.classList.contains(name)).toBe(true);
		expect(pill.parentElement!.className).toMatch(/\brelative\b/);
		act(() => live.status.set("down"));
		const offline = screen.getByText("The server is offline. Start it with trellis serve.").closest("[role=status]")!;
		expect(offline.className).toMatch(/\bbg-danger-soft\b/);
		expect(offline.className).toMatch(/\btext-danger\b/);
	});

	// SH-10. A URL with no route shows the page-level empty state inside
	// the shell, in the deck's words, with a way back.
	test("an unknown URL shows the page-level not-found state in the shell", async () => {
		renderApp({ path: "/nowhere", actor: "navid" });
		const title = await screen.findByRole("heading", { name: "Page not found" });
		expect(screen.getByText("No page has this URL.")).toBeDefined();
		expect(title.parentElement!.className).toMatch(/pb-\[15vh\]/);
		const back = within(screen.getByRole("main")).getByRole("link", { name: "Needs you" });
		expect(back.className).toMatch(/\bh-8\b/);
		expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeDefined();
	});

	// WS-70
	test("the Reconnected banner shows for 2 s", async () => {
		const clock = createFakeScheduler();
		const { live } = renderApp({
			path: "/needs-you",
			actor: "navid",
			liveStatus: "reconnecting",
			scheduler: clock.scheduler,
		});
		await screen.findByText("Reconnecting to the server…");
		act(() => live.status.set("live"));
		const banner = screen.getByText("Reconnected");
		expect(banner.closest("[role=status]")!.className).toMatch(/success/);
		act(() => clock.advanceTo(1999));
		expect(screen.getByText("Reconnected")).toBeDefined();
		act(() => clock.advanceTo(2000));
		expect(screen.queryByText("Reconnected")).toBeNull();
	});
});
