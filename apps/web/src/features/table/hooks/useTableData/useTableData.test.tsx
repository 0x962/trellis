import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import type { ListQueryInput } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { renderHookWithProviders } from "../../../../../test/renderHook";
import { seedTickets } from "../../../../../test/seedMany";
import { inputs, listCalls, sleep } from "../../../../../test/table";
import { parseSearch, toListQuery, type View, viewOf } from "../../../filters/grammar";
import { useTableData } from "./useTableData";

type Closed = "done" | "canceled";

const active = ["todo", "started", "review"];

const mount = (server: FakeServer, view: View = viewOf({}), expanded: Closed[] = []) =>
	renderHookWithProviders(
		(input: { expanded: Closed[] }) => useTableData({ project: "CDE", view, expanded: input.expanded }),
		{ expanded },
		{ path: "/p/CDE", actor: "navid", server },
	);

// The list requests of the active pass: the ones that ask for the todo category.
const activePages = (server: FakeServer) =>
	inputs(server, "tickets.list").filter((input) => (input.category as string[] | undefined)?.includes("todo"));

// The cursor the server hands out for `input`, from a second call with the
// same filters.
const nextCursorOf = async (server: FakeServer, input: Record<string, unknown>) =>
	(await server.client.tickets.list(input as ListQueryInput)).nextCursor;

beforeEach(() => localStorage.clear());

// The seed holds 31 active tickets in the CDE subtree.
describe("features/table/hooks/useTableData", () => {
	// Outcome 1. 419 seeded rows and the 31 of the seed make 450.
	test("loads every active ticket in 200-row pages until the cursor is exhausted", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 419 });
		const { result } = mount(server);
		await waitFor(() => expect(result.current.rows).toHaveLength(450), { timeout: 15_000 });
		const pages = activePages(server);
		expect(pages).toHaveLength(3);
		for (const page of pages) expect(page).toMatchObject({ project: "CDE", limit: 200, category: active });
		expect(pages[0]).not.toHaveProperty("cursor");
		expect(pages[1]!.cursor).toBe(await nextCursorOf(server, pages[0]!));
		expect(pages[2]!.cursor).toBe(await nextCursorOf(server, pages[1]!));
		expect(new Set(result.current.rows.map((row: { identifier: string }) => row.identifier)).size).toBe(450);
		expect(result.current.capped).toBe(false);
	}, 30_000);

	// Outcome 2. 2369 seeded rows and the 31 of the seed make 2400.
	test("stops loading at the 2000-row cap and reports the list as capped", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 2369 });
		const { result } = mount(server);
		await waitFor(() => expect(result.current.rows).toHaveLength(2000), { timeout: 20_000 });
		await sleep(300);
		expect(activePages(server)).toHaveLength(10);
		expect(result.current.rows).toHaveLength(2000);
		expect(result.current.capped).toBe(true);
	}, 40_000);

	// Outcome 4
	test("asks only for active categories in the first pass", async () => {
		const server = createFakeServer();
		const { result } = mount(server);
		await waitFor(() => expect(result.current.rows).toHaveLength(31));
		expect(listCalls(server).length).toBeGreaterThan(0);
		for (const input of inputs(server, "tickets.list")) {
			expect(input.category).toEqual(active);
			expect(input).not.toHaveProperty("status");
		}
	});

	// Outcome 8. The plan's example URL. A status filter is active, so the
	// pass sends the filters as parsed and adds only the page size.
	test("sends the route's filter grammar as the tickets.list query", async () => {
		const server = createFakeServer();
		const view = parseSearch({ status: "in-progress,agent-review", parent: "none", ci: "fail", sort: "-updatedAt" });
		const { result } = mount(server, view);
		await waitFor(() => expect(listCalls(server).length).toBeGreaterThan(0));
		expect(inputs(server, "tickets.list")[0]).toEqual({ project: "CDE", ...toListQuery(view), limit: 200 });
		await waitFor(() =>
			expect(result.current.rows.map((row: { identifier: string }) => row.identifier)).toEqual(["CDE-44"]),
		);
	});
});
