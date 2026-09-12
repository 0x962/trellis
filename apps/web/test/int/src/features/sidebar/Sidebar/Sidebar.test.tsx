import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";
import { createUiStore, useUiStore } from "../../../../../../src/stores/uiStore";
import { Sidebar } from "../../../../../../src/features/sidebar/Sidebar/Sidebar";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

// A collapsed sidebar carries the hidden attribute, which strips its accessible
// name, so a role query cannot find it. The selector does.
const aside = () => document.querySelector<HTMLElement>('aside[aria-label="Sidebar"]')!;

describe("features/sidebar/Sidebar archived group", () => {
	test("an archived project sits under a collapsed Archived group", async () => {
		const user = userEvent.setup();
		const server = createTestServer({
			prepare: async (client) => void (await client.projects.update({ project: "TRL", archived: true })),
		});
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana", server });
		const tree = await screen.findByRole("navigation", { name: "Projects" });
		await within(tree).findByRole("link", { name: /Cloud Desktop/ });
		expect(within(tree).queryByRole("link", { name: /trellis/ })).toBeNull();
		const toggle = await screen.findByRole("button", { name: /^Archived/ });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("link", { name: /trellis/ })).toBeNull();
		await user.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(await screen.findByRole("link", { name: /trellis/ })).toBeDefined();
		const pages = screen.getByRole("navigation", { name: "trellis pages" });
		expect(within(pages).getByRole("link", { name: "Tickets" }).getAttribute("href")).toBe("/p/TRL");
		expect(within(pages).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/p/TRL/settings");
	});

	test("no archived project shows no Archived group", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		await within(await screen.findByRole("navigation", { name: "Projects" })).findByRole("link", {
			name: /Cloud Desktop/,
		});
		expect(screen.queryByRole("button", { name: /^Archived/ })).toBeNull();
	});
});

describe("features/sidebar/Sidebar", () => {
	test("navigation and projects share label and count columns with named sections", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		const primary = screen.getByRole("navigation", { name: "Workspace" });
		const project = await screen.findByRole("link", { name: /Cloud Desktop/ });
		for (const row of [...within(primary).getAllByRole("link"), project]) {
			expect(row.querySelector('[data-slot="leading"]')!.classList.contains("sidebar-leading")).toBe(true);
			expect(row.querySelector('[data-slot="label"]')!.classList.contains("sidebar-label")).toBe(true);
			expect(row.querySelector('[data-slot="trailing"]')!.classList.contains("sidebar-trailing")).toBe(true);
		}
		expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeDefined();
		expect(screen.getByRole("heading", { name: "AI", level: 2 })).toBeDefined();
	});

	// WS-93. w-60 is 240 px on the 4 px spacing scale.
	test("the sidebar renders the rows in the approved order at 240 px", async () => {
		renderWithProviders(<Sidebar />, { path: "/needs-you", actor: "dana" });
		const element = aside();
		expect(element.tagName).toBe("ASIDE");
		expect(element.className).toMatch(/\bw-60\b/);
		await within(element).findByText("Cloud Desktop");
		const text = element.textContent!;
		const order = ["trellis", "Needs you", "Search", "All tickets", "Projects", "Cloud Desktop", "dana"];
		const positions = order.map((label) => text.indexOf(label));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(text.indexOf("Projects")).toBeGreaterThan(text.indexOf("All tickets"));
	});

	// WS-94. The sidebar shows no count beside Needs you, so the shell reads
	// nothing from the inbox.
	test("Needs you has no count with populated tickets", async () => {
		const server = createTestServer();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana", server });
		const row = await screen.findByRole("link", { name: "Needs you" });
		expect(row.textContent).toBe("Needs you");
		expect(server.callsTo("inbox.get")).toHaveLength(0);
	});

	// WS-95
	test("[ and the toggle button collapse and restore the sidebar", async () => {
		const user = userEvent.setup();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		await within(aside()).findByText("Cloud Desktop");
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		expect(aside().getAttribute("aria-hidden")).toBe("true");
		expect(aside().hidden || /\bw-0\b/.test(aside().className)).toBe(true);
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		expect(aside().getAttribute("aria-hidden")).not.toBe("true");
		await user.click(within(aside()).getByRole("button", { name: "Collapse sidebar" }));
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		expect(aside().getAttribute("aria-hidden")).toBe("true");
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
	});

	// WS-96. The label carries the state, so the color is never the only
	// signal.
	test("the connection panel names every state but a live one", async () => {
		const { live } = renderWithProviders(<Sidebar />, { path: "/all", actor: "dana", liveStatus: "live" });
		// A healthy server says nothing, so the panel is absent.
		expect(within(aside()).queryByRole("status", { name: "Server connection" })).toBeNull();
		act(() => live.status.set("reconnecting"));
		expect(within(aside()).getByRole("status", { name: "Server connection" }).textContent).toContain("Reconnecting");
		act(() => live.status.set("down"));
		expect(within(aside()).getByRole("status", { name: "Server connection" }).textContent).toContain("Server offline");
		act(() => live.status.set("live"));
		expect(within(aside()).queryByRole("status", { name: "Server connection" })).toBeNull();
	});

	// SH-1. The header draws the trellis mark, the favicon drawing, and not
	// a generic icon.
	test("the header shows the trellis mark beside the name", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		const mark = aside().querySelector('svg[viewBox="0 0 32 32"]')!;
		expect(mark).not.toBeNull();
		expect(mark.querySelector("rect")!.getAttribute("class")).toContain("fill-mark");
		expect(aside().querySelector(".lucide-hash")).toBeNull();
	});

	test("the nav rows show 16 px icons and the / key on Search", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		const search = screen.getByRole("link", { name: /^Search/ });
		expect(search.querySelector("kbd")!.textContent).toBe("/");
		for (const name of [/Needs you/, /^Search/, /All tickets/]) {
			const icon = screen.getByRole("link", { name }).querySelector("span[aria-hidden]")!;
			expect(icon.classList.contains("size-4")).toBe(true);
		}
	});

	// WS-97
	test("the navigation rows are links with the current page marked", async () => {
		const user = userEvent.setup();
		const { router } = renderWithProviders(<Sidebar />, { path: "/needs-you", actor: "dana" });
		const needsYou = await screen.findByRole("link", { name: /Needs you/ });
		expect(needsYou.getAttribute("aria-current")).toBe("page");
		expect(needsYou.getAttribute("href")).toBe("/needs-you");
		const search = screen.getByRole("link", { name: /^Search/ });
		expect(search.getAttribute("href")).toBe("/search");
		expect(search.getAttribute("aria-current")).toBeNull();
		const all = screen.getByRole("link", { name: /All tickets/ });
		expect(all.getAttribute("href")).toBe("/all");
		for (const row of within(aside()).getAllByRole("link")) {
			expect(row.tabIndex).toBeGreaterThanOrEqual(0);
		}
		for (const row of within(aside()).getAllByRole("button")) {
			expect(row.tabIndex).toBeGreaterThanOrEqual(0);
		}
		document.body.focus();
		const focused: Element[] = [];
		for (let step = 0; step < 12; step++) {
			await user.tab();
			focused.push(document.activeElement!);
		}
		expect(focused).toContain(needsYou);
		expect(focused).toContain(search);
		expect(focused).toContain(all);
		all.focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
	});
});

describe("features/sidebar/Sidebar AI section", () => {
	// TRL-41. The AI section used to sit inside the project tree scroller, so
	// a tree taller than the sidebar pushed the Personas link out of the clip
	// box. Only the tree scrolls now, so the link keeps its place.
	test("the Personas link sits outside the scrolling project region", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		const personas = await screen.findByRole("link", { name: "Personas" });
		expect(personas.getAttribute("href")).toBe("/ai/personas");
		const scroller = aside().querySelector(".overflow-y-auto")!;
		expect(scroller.querySelector('[data-project-tree=""]')).not.toBeNull();
		expect(scroller.contains(personas)).toBe(false);
		// The scroller takes the spare height, so the AI section and the footer
		// keep theirs.
		expect(scroller.className).toMatch(/\bflex-1\b/);
		expect(personas.closest("nav")!.className).toMatch(/\bshrink-0\b/);
	});
});

describe("features/sidebar/Sidebar footer", () => {
	// Each project reads its own agents on its Manager page, so the footer
	// carries no agents link.
	test("the footer carries no Agents link", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "dana" });
		await screen.findByRole("link", { name: "Settings" });
		expect(screen.queryByRole("link", { name: "Agents" })).toBeNull();
	});
});
