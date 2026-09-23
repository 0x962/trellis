import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { ListOutput, TicketSummary } from "@trellis/api";
import { insertRow, rowsOf } from "./cacheRows";

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
