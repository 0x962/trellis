import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActorFooter } from "../../../../../../src/features/sidebar/ActorFooter/ActorFooter";
import { lastCallTo } from "../../../../../inbox";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { storedActorName } from "../../../../../rows";
import { createTestServer } from "../../../../../server";

beforeEach(() => localStorage.clear());

describe("features/sidebar/ActorFooter", () => {
	test("a long account name truncates without shrinking the account control", () => {
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "a-name-that-fills-the-sidebar" });
		const trigger = screen.getByRole("button", { name: /a-name-that-fills-the-sidebar/ });
		const name = within(trigger).getByText("a-name-that-fills-the-sidebar");
		expect(name.classList.contains("truncate")).toBe(true);
		expect(name.getAttribute("title")).toBe("a-name-that-fills-the-sidebar");
		expect(trigger.classList.contains("min-h-11")).toBe(true);
	});

	// WS-103
	test("the footer shows the actor chip, settings, and help", async () => {
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "dana" });
		const avatar = screen.getByRole("img", { name: "dana" });
		expect(avatar.textContent).toBe("D");
		const chip = screen.getByRole("button", { name: /dana/ });
		expect(chip.textContent).toContain("dana");
		// The chip carries the name alone; the kind is not worth a word.
		expect(within(chip).queryByText("human")).toBeNull();
		const settings = screen.getByRole("link", { name: "Settings" });
		expect(settings.getAttribute("href")).toBe("/settings");
		expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeDefined();
	});

	// SH-5. Checks and PR states need gh, so the Settings link carries a
	// warning dot while gh does not answer as a signed-in user.
	test("the Settings link shows a warning dot while gh is not signed in", async () => {
		const server = createTestServer();
		server.setGh({ ok: false, user: null, reason: "unauthenticated", message: null, checkedAt: null });
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "dana", server });
		const settings = screen.getByRole("link", { name: "Settings" });
		await waitFor(() => expect(settings.querySelector("[data-gh-warning]")).not.toBeNull());
		const dot = settings.querySelector("[data-gh-warning]")!;
		for (const name of ["size-1.5", "rounded-sm", "bg-warning"]) expect(dot.classList.contains(name)).toBe(true);
		const description = document.getElementById(settings.getAttribute("aria-describedby")!)!;
		expect(description.textContent).toBe("gh is not signed in.");
	});

	test("the Settings link shows no dot while gh is signed in", async () => {
		const server = createTestServer();
		server.setGh({ ok: true, user: "dana-k", reason: null, message: null, checkedAt: null });
		const { queryClient, orpc } = renderWithProviders(<ActorFooter />, { path: "/all", actor: "dana", server });
		await waitFor(() => expect(queryClient.getQueryData(orpc.system.gh.queryKey({}))).toBeDefined());
		expect(screen.getByRole("link", { name: "Settings" }).querySelector("[data-gh-warning]")).toBeNull();
	});

	// WS-104. The rename lives in a popover on the chip; Enter submits.
	test("the rename popover updates the identity", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "dana" });
		await user.click(screen.getByRole("button", { name: /dana/ }));
		const input = (await screen.findByRole("textbox", { name: /name/i })) as HTMLInputElement;
		expect(input.value).toBe("dana");
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
		renderWithProviders(<ActorFooter />, { path: "/all", actor: "dana", server });
		await user.click(screen.getByRole("button", { name: /dana/ }));
		const input = await screen.findByRole("textbox", { name: /name/i });
		await user.clear(input);
		await user.type(input, "nk{Enter}");
		await waitFor(async () => expect(await storedActorName(server)).toBe("nk"));
		expect(lastCallTo(server, "settings.set")!.input).toEqual({ ...before, defaultActorName: "nk" });
	});
});
