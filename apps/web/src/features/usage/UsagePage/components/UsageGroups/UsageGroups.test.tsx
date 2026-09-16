import { describe, expect, mock, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UsageGroupRow } from "@trellis/api";
import { UsageGroups } from "./UsageGroups";

const days = ["2026-09-14", "2026-09-15", "2026-09-16"];

const row = (overrides: Partial<UsageGroupRow>): UsageGroupRow => ({
	key: "ticket:CDE-7",
	label: "CDE-7",
	detail: "Add the usage page",
	href: "/t/CDE-7",
	harness: null,
	usd: 4,
	tokens: 2_000_000,
	sessions: 2,
	runs: 1,
	approximate: false,
	days: [{ day: "2026-09-15", usd: 4, tokens: 2_000_000 }],
	...overrides,
});

const rows = [row({}), row({ key: "outside", label: "Outside Trellis", detail: null, href: null, usd: 1, runs: 0 })];

// The rows link to ticket and project routes, so they render inside a router.
const mount = (element: React.ReactElement) => {
	const router = createRouter({
		routeTree: createRootRoute({ component: () => element }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	return render(<RouterProvider router={router} />);
};

describe("UsageGroups", () => {
	test("ranks one bar per slice with its share and a link to the ticket, and a click selects the row", async () => {
		const user = userEvent.setup();
		const onSelectRow = mock();
		mount(
			<UsageGroups
				group="ticket"
				rows={rows}
				metric="usd"
				total={5}
				days={days}
				selectedRow={null}
				onGroupChange={() => {}}
				onSelectRow={onSelectRow}
			/>,
		);
		expect(await screen.findByRole("radiogroup", { name: "Group by" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "By ticket" }).querySelectorAll("li")).toHaveLength(2);
		expect(screen.getByRole("link", { name: "Open CDE-7" }).getAttribute("href")).toBe("/t/CDE-7");
		expect(screen.getByText("80%")).toBeTruthy();
		expect(screen.getByText("20%")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: /CDE-7/ }));
		expect(onSelectRow).toHaveBeenLastCalledWith("ticket:CDE-7");
	});

	test("a selected row is pressed, prints tokens under the token metric, and a second click clears it", async () => {
		const user = userEvent.setup();
		const onSelectRow = mock();
		mount(
			<UsageGroups
				group="ticket"
				rows={rows}
				metric="tokens"
				total={2_500_000}
				days={days}
				selectedRow="ticket:CDE-7"
				onGroupChange={() => {}}
				onSelectRow={onSelectRow}
			/>,
		);
		const button = await screen.findByRole("button", { name: /CDE-7/ });
		expect(button.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("2.0M")).toBeTruthy();
		await user.click(button);
		expect(onSelectRow).toHaveBeenLastCalledWith(null);
	});
});
