import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../server";
import { findGrid, footer, groupCount, resetUi } from "../../../../../table";
import { tableViewport } from "../../../../../viewport";
import { formatCount } from "../../../../../../src/lib/format";

const installViewport = tableViewport(600);

beforeEach(() => {
	resetUi();
	installViewport();
});

// The seed cancels tickets in CDE only, so a second root cancels one here.
// Done already spans CDE and TRL.
const closedInTwoRoots = () =>
	createTestServer({
		prepare: async (client) => {
			const ticket = await client.tickets.create({ project: "TRL", title: "A ticket the team dropped" });
			await client.tickets.move({ ticket: ticket.identifier, status: "canceled", force: true });
		},
	});

// The roots whose subtree holds a ticket of `category`.
const rootsWith = async (server: TestServer, category: "done" | "canceled") => {
	const { items } = await server.client.tickets.list({ category: [category], limit: 200 });
	return new Set(items.map((ticket) => ticket.project.path.split(".")[0]!));
};

// TRL-30. /all folds the statuses of every root by slug, so the folded list
// names one root's Done status. A count that reads that one id misses the
// tickets the other roots closed, and the footer, which subtracts from the
// same numbers, misses them too.
describe("features/table/TicketTable closed counts", () => {
	test("the closed group counts add up every root's closed tickets", async () => {
		const server = closedInTwoRoots();
		renderApp({ path: "/all/table", actor: "dana", server });
		await findGrid();
		// The seed must close tickets in more than one root, or the defect
		// cannot show.
		expect((await rootsWith(server, "done")).size).toBeGreaterThan(1);
		expect((await rootsWith(server, "canceled")).size).toBeGreaterThan(1);
		const done = await server.client.tickets.counts({ category: ["done"] });
		const canceled = await server.client.tickets.counts({ category: ["canceled"] });
		await waitFor(() => expect(groupCount("done")).toBe(formatCount(done.total)));
		await waitFor(() => expect(groupCount("canceled")).toBe(formatCount(canceled.total)));
	});

	test("the footer counts every ticket the scope holds", async () => {
		const server = closedInTwoRoots();
		renderApp({ path: "/all/table", actor: "dana", server });
		await findGrid();
		const all = await server.client.tickets.counts({});
		await waitFor(() => expect(footer().textContent).toContain(`${formatCount(all.total)} tickets`));
	});

	// A project route reads its own effective statuses, which already cover
	// its subtree, so its counts stay right.
	test("a project route keeps its own closed counts", async () => {
		const server = createTestServer();
		renderApp({ path: "/p/CDE/table", actor: "dana", server });
		await findGrid();
		const done = await server.client.tickets.counts({ project: "CDE", category: ["done"] });
		const all = await server.client.tickets.counts({ project: "CDE" });
		await waitFor(() => expect(groupCount("done")).toBe(formatCount(done.total)));
		await waitFor(() => expect(footer().textContent).toContain(`${formatCount(all.total)} tickets`));
	});
});
