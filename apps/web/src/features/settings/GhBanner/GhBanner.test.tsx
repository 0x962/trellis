import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { createEventApplier, type GhStatus } from "@trellis/api";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { GhBanner } from "./GhBanner";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

// The server runs `gh auth status` for every read, so the check time it
// reports is the instant of the request.
const ready: GhStatus = { ok: true, user: "octocat", reason: null, message: null, checkedAt: null };

const missing: GhStatus = {
	ok: false,
	user: null,
	reason: "missing",
	message: "gh is not installed. Install it with `brew install gh` and run `gh auth login`.",
	checkedAt: new Date().toISOString(),
};

const withGh = (status: Partial<GhStatus>) => createTestServer({ gh: { ...missing, ...status } });

const render = (server: TestServer) => renderWithProviders(<GhBanner />, { path: "/settings", actor: "navid", server });

describe("GhBanner", () => {
	// ST-16. A working gh needs no banner, only the state.
	test("shows the ready state with the user and the check time", async () => {
		render(withGh(ready));
		expect(await screen.findByText(/octocat/)).toBeDefined();
		expect(await screen.findByText(/just now/)).toBeDefined();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	// ST-17. The banner says what stays empty and what to run.
	test("shows the missing-gh copy with the install command", async () => {
		render(withGh({ ok: false, user: null, reason: "missing", message: null }));
		const banner = await screen.findByRole("alert");
		expect(banner.textContent).toContain("trellis cannot find the GitHub CLI");
		expect(banner.textContent).toContain("PR checks stay empty");
		const command = await screen.findByText("brew install gh");
		expect(command.getAttribute("class")).toContain("font-mono");
		expect(await screen.findByRole("button", { name: /copy/i })).toBeDefined();
	});

	// ST-18
	test("shows the unauthenticated copy with the login command", async () => {
		render(withGh({ ok: false, user: null, reason: "unauthenticated", message: null }));
		const banner = await screen.findByRole("alert");
		expect(banner.textContent).toContain("gh is not signed in");
		expect(banner.textContent).toContain("PR checks stay empty");
		const command = await screen.findByText("gh auth login");
		expect(command.getAttribute("class")).toContain("font-mono");
		expect(await screen.findByRole("button", { name: /copy/i })).toBeDefined();
	});

	// ST-19. An unknown failure has no command to offer.
	test("shows the server message for a gh error", async () => {
		render(withGh({ ok: false, user: null, reason: "error", message: "gh exited with code 4." }));
		const banner = await screen.findByRole("alert");
		expect(banner.textContent).toContain("gh exited with code 4.");
		expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
	});

	// ST-20. The poller reports a state change, and the page follows it.
	test("follows a live gh.status event", async () => {
		const server = withGh({ ok: false, user: null, reason: "missing", message: null });
		const { queryClient } = render(server);
		await screen.findByRole("alert");
		server.setGh(ready);
		createEventApplier(queryClient).applyEvent({ type: "gh.status", ok: true });
		await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
		expect(await screen.findByText(/octocat/)).toBeDefined();
	});
});
