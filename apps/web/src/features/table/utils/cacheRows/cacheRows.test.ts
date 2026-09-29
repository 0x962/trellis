import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { ListOutput, TicketSummary } from "@trellis/api";
import { insertRow, insertRows, rowsOf } from "./cacheRows";

const page = (items: TicketSummary[] = []): ListOutput => ({ items, nextCursor: null });

const ticket = (category: TicketSummary["status"]["category"], slug: string): TicketSummary =>
	({
		id: "01M330000000000000000TST01",
		identifier: "TRL-999",
		priority: "urgent",
		project: { id: "01M330000000000000000PRJ01", key: "TRL", path: "TRL", name: "Trellis" },
		parent: null,
		status: {
			id: "01M330000000000000000STS01",
			name: slug === "done" ? "Done" : "In Progress",
			slug,
			category,
			color: "gray",
		},
	}) as unknown as TicketSummary;

test("insertRow puts a done ticket in a cached done list", () => {
	const queryClient = new QueryClient();
	const doneKey = [["tickets", "list"], { input: { project: "TRL", status: "done" }, type: "infinite" }];
	const activeKey = [["tickets", "list"], { input: { project: "TRL", category: ["todo", "started", "review"] } }];
	queryClient.setQueryData(doneKey, { pages: [page()], pageParams: [undefined] });
	queryClient.setQueryData(activeKey, page());

	insertRow(queryClient, ticket("done", "done"));

	expect(rowsOf(queryClient.getQueryData(doneKey)!).map((row) => row.identifier)).toEqual(["TRL-999"]);
	expect(rowsOf(queryClient.getQueryData(activeKey)!).map((row) => row.identifier)).toEqual([]);
});

test("insertRows scans existing pages once and inserts the complete matching batch", () => {
	const client = new QueryClient();
	const key = [["tickets", "list"], { input: { status: "done" }, type: "infinite" }];
	let reads = 0;
	const rows = Array.from({ length: 10_000 }, (_, index) => ({
		...ticket("done", "done"),
		get id() {
			reads++;
			return String(index);
		},
	}));
	client.setQueryData(key, { pages: [page(rows.slice(0, 2500)), page(rows.slice(2500, 5000))], pageParams: [0, 1] });
	const writes: unknown[] = [];
	const unsubscribe = client.getQueryCache().subscribe((event) => {
		if (event.type === "updated" && event.action.type === "success" && event.action.manual) writes.push(event);
	});
	insertRows(client, [...rows, { ...ticket("started", "in-progress"), id: "excluded" }]);
	expect(reads).toBeLessThan(40_000);
	expect(writes).toHaveLength(1);
	const saved = rowsOf(client.getQueryData(key)!);
	expect(saved).toHaveLength(10_000);
	expect(new Set(saved.map((row) => row.id)).size).toBe(10_000);
	expect(saved[0]?.id).toBe("9999");
	unsubscribe();
	client.clear();
});
