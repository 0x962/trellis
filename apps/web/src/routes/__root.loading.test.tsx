import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakeScheduler } from "../../test/fakeScheduler";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

// A server that stops answering on `stop()`: every request then fails the
// way a browser fetch fails when nothing listens on the port.
const stoppable = () => {
	const server = createTestServer();
	const real = server.fetch;
	let down = false;
	const wrapped: TestServer = {
		...server,
		fetch: (request, init) => (down ? Promise.reject(new TypeError("Failed to fetch")) : real(request, init)),
	};
	return { server: wrapped, stop: () => (down = true), start: () => (down = false) };
};

const sidebars = () => screen.queryAllByRole("complementary", { name: "Sidebar" });

describe("routes/__root loading and errors", () => {
	// ER-1. A cold load that waits on the server paints the shell frame
	// after 300 ms, not a blank page.
	test("a slow cold load paints the shell frame, then the app", async () => {
		const server = createTestServer();
		const hold = server.holdNext("projects.list");
		renderApp({ path: "/needs-you", actor: "dana", server });
		const frame = await waitFor(
			() => {
				const found = document.querySelector<HTMLElement>("[data-shell-frame]");
				expect(found).not.toBeNull();
				return found!;
			},
			{ timeout: 2000 },
		);
		const aside = within(frame).getByRole("complementary", { name: "Sidebar" });
		for (const label of ["trellis", "Needs you", "Search", "All tickets", "Projects"]) {
			expect(within(aside).getByText(label)).toBeDefined();
		}
		expect(within(aside).queryByRole("navigation", { name: "Projects" })).toBeNull();
		act(() => hold.release());
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		await waitFor(() => expect(document.querySelector("[data-shell-frame]")).toBeNull());
	});

	// ER-3. A navigation that takes longer than 150 ms shows a thin accent
	// bar at the top of the main pane until the page arrives.
	test("a slow navigation shows the progress bar after 150 ms", async () => {
		const clock = createFakeScheduler();
		const { server, router } = renderApp({ path: "/needs-you", actor: "dana", scheduler: clock.scheduler });
		const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
		const hold = server.holdNext("tickets.counts");
		fireEvent.click(within(sidebar).getByRole("link", { name: /All tickets/ }));
		await waitFor(() => expect(router.state.isLoading).toBe(true));
		act(() => clock.advanceTo(149));
		expect(screen.queryByRole("progressbar", { name: "Loading the page" })).toBeNull();
		act(() => clock.advanceTo(150));
		const bar = screen.getByRole("progressbar", { name: "Loading the page" });
		expect(bar.className).toMatch(/\bh-0\.5\b/);
		expect(bar.className).toMatch(/\bbg-accent\b/);
		expect(screen.getByRole("main").contains(bar) || bar.parentElement!.contains(screen.getByRole("main"))).toBe(true);
		act(() => hold.release());
		await waitFor(() => expect(screen.queryByRole("progressbar", { name: "Loading the page" })).toBeNull());
	});

	// ER-4. A load that fails because the server does not answer shows the
	// cause inside the shell frame, with a Retry that loads the page again.
	test("a failed load shows Server offline inside the shell, and Retry loads the page", async () => {
		const { server, stop, start } = stoppable();
		stop();
		renderApp({ path: "/needs-you", actor: "dana", server });
		const title = await screen.findByRole("heading", { name: "Server offline" });
		expect(document.querySelector("[data-shell-frame]")!.contains(title)).toBe(true);
		const body = screen.getByText(/trellis did not load this page\./);
		expect(body.textContent).toContain(`The server at ${window.location.host} does not answer.`);
		expect(within(body).getByText(window.location.host).className).toMatch(/\bfont-mono\b/);
		const retry = screen.getByRole("button", { name: "Retry" });
		expect(retry.className).toMatch(/\bh-8\b/);
		start();
		fireEvent.click(retry);
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		expect(sidebars()).toHaveLength(1);
	});

	// ER-4. The page loads again on its own when the live connection
	// comes back.
	test("the failed page loads again when the connection comes back", async () => {
		const { server, stop, start } = stoppable();
		stop();
		const { live } = renderApp({ path: "/needs-you", actor: "dana", server, liveStatus: "down" });
		await screen.findByRole("heading", { name: "Server offline" });
		start();
		act(() => live.status.set("live"));
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
	});

	// A navigation while the server is down keeps one sidebar on screen.
	test("a navigation while the server is down shows Server offline with one sidebar", async () => {
		const { server, stop } = stoppable();
		const { router } = renderApp({ path: "/needs-you", actor: "dana", server });
		await screen.findByRole("heading", { name: /Needs you/ });
		stop();
		await act(() => router.navigate({ to: "/all" }));
		expect(await screen.findByRole("heading", { name: "Server offline" })).toBeDefined();
		expect(sidebars()).toHaveLength(1);
	});
});
