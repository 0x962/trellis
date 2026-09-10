import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createUiStore, useUiStore } from "../../../stores/uiStore";
import { Sidebar } from "./Sidebar";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

const aside = () => screen.getByRole("complementary", { name: "Sidebar" });

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

	// WS-94. The badge is the sum of what a person must act on: reviews
	// waiting and CI failures.
	test("the Needs you badge sums the review and failing CI totals", async () => {
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const row = await screen.findByRole("link", { name: /Needs you/ });
		const badge = await within(row).findByText("4");
		expect(badge.className).toMatch(/\btabular\b/);
		localStorage.clear();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid", server: createFakeServer({ empty: true }) });
		const rows = await screen.findAllByRole("link", { name: /Needs you/ });
		const empty = rows[rows.length - 1]!;
		await waitFor(() => expect(within(empty).queryByText(/^\d+$/)).toBeNull());
	});

	// WS-95
	test("[ and the toggle button collapse and restore the sidebar", async () => {
		const user = userEvent.setup();
		renderWithProviders(<Sidebar />, { path: "/all", actor: "navid" });
		const sidebar = aside();
		await within(sidebar).findByText("Superset CDE");
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		expect(sidebar.getAttribute("aria-hidden")).toBe("true");
		expect(sidebar.hidden || /\bw-0\b/.test(sidebar.className)).toBe(true);
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		expect(sidebar.getAttribute("aria-hidden")).not.toBe("true");
		await user.click(within(sidebar).getByRole("button", { name: "Collapse sidebar" }));
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		expect(sidebar.getAttribute("aria-hidden")).toBe("true");
		fireEvent.keyDown(document.body, { key: "[" });
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
	});

	// WS-96. The label carries the state, so the color is never the only
	// signal.
	test("the connection dot mirrors the live status with a label", async () => {
		const { live } = renderWithProviders(<Sidebar />, { path: "/all", actor: "navid", liveStatus: "live" });
		const dot = within(aside()).getByLabelText("Connected");
		expect(dot.className).toMatch(/\bbg-success\b/);
		act(() => live.status.set("reconnecting"));
		expect(within(aside()).getByLabelText("Reconnecting").className).toMatch(/\bbg-warning\b/);
		act(() => live.status.set("restarting"));
		expect(within(aside()).getByLabelText("Reconnecting").className).toMatch(/\bbg-warning\b/);
		act(() => live.status.set("down"));
		expect(within(aside()).getByLabelText("Disconnected").className).toMatch(/\bbg-danger\b/);
		expect(within(aside()).queryByLabelText("Connected")).toBeNull();
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
