import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lastCallTo } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { storedActorName } from "../../../../test/rows";
import { createTestServer } from "../../../../test/server";
import { ActorFooter } from "./ActorFooter";

beforeEach(() => localStorage.clear());

describe("features/sidebar/ActorFooter", () => {
	// WS-103
	test("the footer shows the actor chip, settings, and help", async () => {
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid" });
		const avatar = screen.getByRole("img", { name: "navid" });
		expect(avatar.textContent).toBe("N");
		const chip = screen.getByRole("button", { name: /navid/ });
		expect(chip.textContent).toContain("navid");
		const kind = within(chip).getByText("human");
		expect(kind.className).toMatch(/\btext-fg-muted\b/);
		const settings = screen.getByRole("link", { name: "Settings" });
		expect(settings.getAttribute("href")).toBe("/settings");
		expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeDefined();
	});

	// SH-5. Checks and PR states need gh, so the Settings link carries a
	// warning dot while gh does not answer as a signed-in user.
	test("the Settings link shows a warning dot while gh is not signed in", async () => {
		const server = createTestServer();
		server.setGh({ ok: false, user: null, reason: "unauthenticated", message: null, checkedAt: null });
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid", server });
		const settings = screen.getByRole("link", { name: "Settings" });
		await waitFor(() => expect(settings.querySelector("[data-gh-warning]")).not.toBeNull());
		const dot = settings.querySelector("[data-gh-warning]")!;
		for (const name of ["size-1.5", "rounded-full", "bg-warning"]) expect(dot.classList.contains(name)).toBe(true);
		const description = document.getElementById(settings.getAttribute("aria-describedby")!)!;
		expect(description.textContent).toBe("gh is not signed in.");
	});

	test("the Settings link shows no dot while gh is signed in", async () => {
		const server = createTestServer();
		server.setGh({ ok: true, user: "navid-k", reason: null, message: null, checkedAt: null });
		const { queryClient, orpc } = renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid", server });
		await waitFor(() => expect(queryClient.getQueryData(orpc.system.gh.queryKey({}))).toBeDefined());
		expect(screen.getByRole("link", { name: "Settings" }).querySelector("[data-gh-warning]")).toBeNull();
	});

	// WS-104. The rename lives in a popover on the chip; Enter submits.
	test("the rename popover updates the identity", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid" });
		await user.click(screen.getByRole("button", { name: /navid/ }));
		const input = (await screen.findByRole("textbox", { name: /name/i })) as HTMLInputElement;
		expect(input.value).toBe("navid");
		await user.clear(input);
		await user.type(input, "nk{Enter}");
		expect(JSON.parse(localStorage.getItem("trellis.actor")!)).toEqual({ name: "nk", kind: "human" });
		await waitFor(() => expect(screen.getByRole("button", { name: /^nk/ })).toBeDefined());
		expect(screen.getByRole("img", { name: "nk" }).textContent).toBe("N");
		await waitFor(() => expect(screen.queryByRole("textbox", { name: /name/i })).toBeNull());
	});

	// The server holds the name every browser starts with.
	test("the rename popover saves the name to the server settings", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const before = await server.client.settings.get();
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "navid", server });
		await user.click(screen.getByRole("button", { name: /navid/ }));
		const input = await screen.findByRole("textbox", { name: /name/i });
		await user.clear(input);
		await user.type(input, "nk{Enter}");
		await waitFor(async () => expect(await storedActorName(server)).toBe("nk"));
		expect(lastCallTo(server, "settings.set")!.input).toEqual({ ...before, defaultActorName: "nk" });
	});
});
