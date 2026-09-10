import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import type { ListQueryInput } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { renderHookWithProviders } from "../../../../../test/renderHook";
import { renderApp } from "../../../../../test/renderWithProviders";
import { seedTickets } from "../../../../../test/seedMany";
import { findGrid, inputs, queryGroupHeader, sleep } from "../../../../../test/table";
import { tableViewport } from "../../../../../test/viewport";
import { parseSearch, type View, viewOf } from "../../../filters/grammar";
import { useTableData } from "./useTableData";

type Closed = "done" | "canceled";

const installViewport = tableViewport(800);

const mount = (server: FakeServer, view: View = viewOf({}), expanded: Closed[] = []) =>
	renderHookWithProviders(
		(input: { expanded: Closed[] }) => useTableData({ project: "CDE", view, expanded: input.expanded }),
		{ expanded },
		{ path: "/p/CDE", actor: "navid", server },
	);

// The list requests that ask for one closed status.
const requestsFor = (server: FakeServer, slug: Closed) =>
	inputs(server, "tickets.list").filter((input) => (input.status as string[] | undefined)?.includes(slug));

beforeEach(() => {
	localStorage.clear();
	installViewport();
});

// The seed holds 31 active, 19 done, and 2 canceled tickets in the CDE subtree.
describe("features/table/hooks/useTableData: the Done and Canceled groups", () => {
	// Outcome 5. 15 seeded rows and the 19 of the seed make 34.
	test("loads the Done group's first page only when the group expands", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 15, status: "done" });
		const { result, rerender } = mount(server);
		await waitFor(() => expect(result.current.rows).toHaveLength(31));
		await sleep(100);
		expect(requestsFor(server, "done")).toHaveLength(0);
		expect(result.current.closed.done.rows).toHaveLength(0);
		rerender({ expanded: ["done"] });
		await waitFor(() => expect(result.current.closed.done.rows).toHaveLength(34));
		const done = requestsFor(server, "done");
		expect(done).toHaveLength(1);
		expect(done[0]).toMatchObject({ project: "CDE", status: ["done"], limit: 50 });
		expect(done[0]).not.toHaveProperty("category");
		expect(result.current.closed.done.hasMore).toBe(false);
		expect(result.current.closed.canceled.rows).toHaveLength(0);
		expect(requestsFor(server, "canceled")).toHaveLength(0);
		expect(result.current.rows).toHaveLength(31);
	});

	// Outcome 6. 41 seeded rows and the 19 of the seed make 60: one page of
	// 50, then 10 more.
	test("pages the Done group with its own cursor", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 41, status: "done" });
		const { result } = mount(server, viewOf({}), ["done"]);
		await waitFor(() => expect(result.current.closed.done.rows).toHaveLength(50), { timeout: 10_000 });
		expect(result.current.closed.done.hasMore).toBe(true);
		result.current.closed.done.loadMore();
		await waitFor(() => expect(result.current.closed.done.rows).toHaveLength(60), { timeout: 10_000 });
		const done = requestsFor(server, "done");
		expect(done).toHaveLength(2);
		const first = await server.client.tickets.list(done[0] as ListQueryInput);
		expect(done[1]!.cursor).toBe(first.nextCursor);
		expect(result.current.closed.done.hasMore).toBe(false);
		expect(result.current.closed.canceled.rows).toHaveLength(0);
		expect(result.current.rows).toHaveLength(31);
	}, 20_000);

	// Outcome 7. A status filter names every group the table shows, so the
	// two closed groups have no place and no request.
	test("hides the Done and Canceled groups while a status filter is active", async () => {
		const server = createFakeServer();
		const view = parseSearch({ status: "in-progress" });
		const { result } = mount(server, view, ["done", "canceled"]);
		await waitFor(() => expect(result.current.rows).toHaveLength(4));
		await sleep(100);
		expect(result.current.closed).toBeNull();
		expect(requestsFor(server, "done")).toHaveLength(0);
		expect(requestsFor(server, "canceled")).toHaveLength(0);

		const app = renderApp({ path: "/p/CDE?status=in-progress", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(queryGroupHeader("in-progress")).not.toBeNull());
		expect(queryGroupHeader("done")).toBeNull();
		expect(queryGroupHeader("canceled")).toBeNull();
		await sleep(100);
		expect(requestsFor(app.server, "done")).toHaveLength(0);
		expect(requestsFor(app.server, "canceled")).toHaveLength(0);
	});
});
