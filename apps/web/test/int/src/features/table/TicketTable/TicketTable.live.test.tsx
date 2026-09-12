import { beforeEach, describe, expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import { applyEvent, type TicketSummary } from "@trellis/api";
import { batchId } from "../../../../../fixtures";
import { renderApp } from "../../../../../renderWithProviders";
import type { TestServer } from "../../../../../server";
import {
	bulkBar,
	cellOf,
	findGrid,
	focusRow,
	footer,
	groupCount,
	listCalls,
	press,
	queryRow,
	resetUi,
	rowOf,
	rows,
	sleep,
	spacer,
} from "../../../../../table";
import { tableViewport } from "../../../../../viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

// Human Review: CDE-42, then CDE-37.
const review = "/p/CDE/table?status=human-review";

const summaryOf = async (server: TestServer, identifier: string) => {
	const { items } = await server.client.tickets.list({ project: "CDE", limit: 200 });
	return items.find((item) => item.identifier === identifier)!;
};

const updated = (summary: TicketSummary, fields: string[]) => ({ type: "ticket.updated", summary, fields, batchId });

const footerCount = () => Number(/(\d+) tickets?/.exec(footer().textContent!)![1]);

describe("features/table/TicketTable: live events", () => {
	// Outcome 101
	test("patches a row from a ticket.updated event without a refetch", async () => {
		const { server, queryClient } = renderApp({ path: review, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		const summary = await summaryOf(server, "CDE-42");
		const before = listCalls(server).length;
		act(() =>
			applyEvent(updated({ ...summary, version: summary.version + 1, title: "Fixed title" }, ["title"]), queryClient),
		);
		expect(cellOf("CDE-42", "title").textContent).toContain("Fixed title");
		await sleep(600);
		expect(listCalls(server)).toHaveLength(before);
	});

	// Outcome 102. The Todo group of /p/CDE shows the first rows.
	test("keeps the fixed row heights through a burst of live patches", async () => {
		const { server, queryClient } = renderApp({ path: "/p/CDE/table", actor: "dana" });
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(10));
		const height = spacer().style.height;
		const { items } = await server.client.tickets.list({ project: "CDE", category: ["todo"], limit: 20 });
		act(() => {
			for (const item of items) {
				applyEvent(
					updated({ ...item, version: item.version + 1, title: `${item.title} (patched)` }, ["title"]),
					queryClient,
				);
			}
		});
		for (const row of rows()) expect(row.style.height).toBe("36px");
		expect(spacer().style.height).toBe(height);
	});

	// Outcome 103
	test("regroups a row and updates the counts when a status event arrives", async () => {
		const { server, queryClient } = renderApp({ path: "/p/CDE/table?status=in-progress,human-review", actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		expect(groupCount("in-progress")).toBe("4");
		expect(groupCount("human-review")).toBe("2");
		const summary = await summaryOf(server, "CDE-42");
		const { statuses } = await server.client.statuses.list({ project: "CDE" });
		const { id, slug, name, category, reviewer, color } = statuses.find((entry) => entry.slug === "in-progress")!;
		const status = { id, slug, name, category, reviewer, color };
		act(() => applyEvent(updated({ ...summary, version: summary.version + 1, status }, ["status"]), queryClient));
		expect(rowOf("CDE-42").getAttribute("data-group")).toBe("in-progress");
		expect(groupCount("in-progress")).toBe("5");
		expect(groupCount("human-review")).toBe("1");
	});

	// Outcome 104. The coalescer trails 250 ms; one flush, one refetch.
	test("adds a created ticket through the coalesced invalidation", async () => {
		const { server, queryClient } = renderApp({ path: "/p/CDE/table?status=in-progress", actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		const before = listCalls(server).length;
		const created = await server.client.tickets.create({
			project: "CDE",
			title: "Brand new urgent work",
			status: "in-progress",
			priority: "urgent",
		});
		const { description, children, prs, attachments, ...summary } = created;
		act(() => applyEvent({ type: "ticket.created", summary, fields: [], batchId }, queryClient));
		await waitFor(() => expect(queryRow(created.identifier)).not.toBeNull(), { timeout: 2000 });
		expect(rows()[0]!.getAttribute("data-identifier")).toBe(created.identifier);
		await sleep(600);
		expect(listCalls(server)).toHaveLength(before + 1);
	});

	// Outcome 105
	test("removes a deleted ticket from the rows and the count", async () => {
		const { server, queryClient } = renderApp({ path: review, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		const count = footerCount();
		const summary = await summaryOf(server, "CDE-42");
		act(() => applyEvent({ type: "ticket.deleted", summary, fields: [], batchId }, queryClient));
		await waitFor(() => expect(queryRow("CDE-42")).toBeNull());
		expect(footerCount()).toBe(count - 1);
	});

	// Outcome 106
	test("ignores an event older than the cached version", async () => {
		const { server, queryClient } = renderApp({ path: review, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		const summary = await summaryOf(server, "CDE-42");
		act(() =>
			applyEvent(updated({ ...summary, version: summary.version - 1, title: "Older title" }, ["title"]), queryClient),
		);
		expect(cellOf("CDE-42", "title").textContent).toContain(summary.title);
		expect(cellOf("CDE-42", "title").textContent).not.toContain("Older title");
	});

	// Outcome 107
	test("keeps the selection through a live patch", async () => {
		const { server, queryClient } = renderApp({ path: review, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		focusRow("CDE-42");
		press("x");
		expect(bulkBar().textContent).toContain("1 selected");
		const summary = await summaryOf(server, "CDE-42");
		act(() =>
			applyEvent(updated({ ...summary, version: summary.version + 1, title: "Patched title" }, ["title"]), queryClient),
		);
		expect(cellOf("CDE-42", "title").textContent).toContain("Patched title");
		expect(rowOf("CDE-42").getAttribute("aria-selected")).toBe("true");
		expect(bulkBar().textContent).toContain("1 selected");
	});
});
