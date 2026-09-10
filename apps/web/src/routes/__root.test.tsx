import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
		expect(screen.getByLabelText("Connected")).toBeDefined();
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

	// WS-68
	test("a finished setup redirects /setup to /needs-you", async () => {
		const { router } = renderApp({ path: "/setup", actor: "navid" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
	});

	// WS-69. The banner is text, so the state never relies on the dot's
	// color alone.
	test("the reconnect banner mirrors the live status", async () => {
		const { live } = renderApp({ path: "/needs-you", actor: "navid", liveStatus: "reconnecting" });
		const banner = await screen.findByText("Reconnecting to trellis…");
		const region = banner.closest("[role=status]")!;
		expect(region).not.toBeNull();
		expect(region.className).toMatch(/warning/);
		act(() => live.status.set("restarting"));
		expect(screen.getByText("Server restarting").closest("[role=status]")!.className).toMatch(/warning/);
		act(() => live.status.set("live"));
		expect(screen.queryByText("Server restarting")).toBeNull();
		expect(screen.queryByText("Reconnecting to trellis…")).toBeNull();
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
		await screen.findByText("Reconnecting to trellis…");
		act(() => live.status.set("live"));
		const banner = screen.getByText("Reconnected");
		expect(banner.closest("[role=status]")!.className).toMatch(/success/);
		act(() => clock.advanceTo(1999));
		expect(screen.getByText("Reconnected")).toBeDefined();
		act(() => clock.advanceTo(2000));
		expect(screen.queryByText("Reconnected")).toBeNull();
	});
});
