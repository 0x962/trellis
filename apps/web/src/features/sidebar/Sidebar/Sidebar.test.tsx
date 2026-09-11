import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { createUiStore, useUiStore } from "../../../stores/uiStore";
import { Sidebar } from "./Sidebar";

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
			prepare: async (client) => void (await client.projects.update({ project: "MRG", archived: true })),
		});
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid", server });
		const tree = await screen.findByRole("navigation", { name: "Projects" });
		await within(tree).findByRole("link", { name: /trellis/ });
		expect(within(tree).queryByRole("link", { name: /margin/ })).toBeNull();
		const toggle = await screen.findByRole("button", { name: /^Archived/ });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("link", { name: /margin/ })).toBeNull();
		await user.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(await screen.findByRole("link", { name: /margin/ })).toBeDefined();
	});

	test("no archived project shows no Archived group", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		await within(await screen.findByRole("navigation", { name: "Projects" })).findByRole("link", { name: /trellis/ });
		expect(screen.queryByRole("button", { name: /^Archived/ })).toBeNull();
	});
});

describe("features/sidebar/Sidebar", () => {
	// WS-93. w-60 is 240 px on the 4 px spacing scale.
	test("the sidebar renders the rows in the canvas order at 240 px", async () => {
		renderWithProviders(<Sidebar />, { path: "/needs-you", actor: "navid" });
		const element = aside();
		expect(element.tagName).toBe("ASIDE");
		expect(element.className).toMatch(/\bw-60\b/);
		await within(element).findByText("Superset CDE");
		const text = element.textContent!;
		const order = ["trellis", "Needs you", "Search", "All tickets", "Projects", "Superset CDE", "navid"];
		const positions = order.map((label) => text.indexOf(label));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(text.indexOf("Projects")).toBeGreaterThan(text.indexOf("All tickets"));
	});

	// WS-94. The badge counts the distinct tickets of Review and Failing checks
	// (D13): 3 in review and 1 other ticket with failed checks in the seed.
	test("the Needs you badge sums the review and failing CI totals", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const row = await screen.findByRole("link", { name: /Needs you/ });
		const badge = await within(row).findByText("4");
		expect(badge.className).toMatch(/\btabular\b/);
		localStorage.clear();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid", server: createTestServer({ empty: true }) });
		const rows = await screen.findAllByRole("link", { name: /Needs you/ });
		const empty = rows[rows.length - 1]!;
		await waitFor(() => expect(within(empty).queryByText(/^\d+$/)).toBeNull());
	});

	// WS-95
	test("[ and the toggle button collapse and restore the sidebar", async () => {
		const user = userEvent.setup();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		await within(aside()).findByText("Superset CDE");
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
	test("the connection dot mirrors the live status with a label", async () => {
		const { live } = renderWithProviders(<Sidebar />, { path: "/all", actor: "navid", liveStatus: "live" });
		const dot = within(aside()).getByLabelText("Online");
		expect(dot.className).toMatch(/\bbg-success\b/);
		act(() => live.status.set("reconnecting"));
		expect(within(aside()).getByLabelText("Reconnecting").className).toMatch(/\bbg-warning\b/);
		act(() => live.status.set("restarting"));
		expect(within(aside()).getByLabelText("Reconnecting").className).toMatch(/\bbg-warning\b/);
		act(() => live.status.set("down"));
		expect(within(aside()).getByLabelText("Offline").className).toMatch(/\bbg-danger\b/);
		expect(within(aside()).queryByLabelText("Online")).toBeNull();
	});

	// SH-1. The header draws the trellis mark, the favicon drawing, and not
	// a generic icon.
	test("the header shows the trellis mark beside the name", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const mark = aside().querySelector('svg[viewBox="0 0 32 32"]')!;
		expect(mark).not.toBeNull();
		expect(mark.querySelector("rect")!.getAttribute("class")).toContain("fill-mark");
		expect(aside().querySelector(".lucide-hash")).toBeNull();
	});

	// SH-2, SH-3, SH-4. The count is an 18 px accent pill, the Search row
	// shows the key that opens search, and every nav icon is 16 px.
	test("the nav rows show 16 px icons, the / key on Search, and the Needs you count as an 18 px pill", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const needsYou = await screen.findByRole("link", { name: /Needs you/ });
		const badge = await within(needsYou).findByText(/^\d+$/);
		for (const name of ["bg-accent-soft", "text-accent", "text-xs", "font-semibold", "h-4.5"]) {
			expect(badge.classList.contains(name)).toBe(true);
		}
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
		const { router } = renderWithProviders(<Sidebar />, { path: "/needs-you", actor: "navid" });
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

describe("features/sidebar/Sidebar agents link", () => {
	test("the footer links the Agents page right after Settings", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const agents = await screen.findByRole("link", { name: "Agents" });
		expect(agents.getAttribute("href")).toBe("/agents");
		const settings = screen.getByRole("link", { name: "Settings" });
		expect(settings.nextElementSibling).toBe(agents);
	});
});
