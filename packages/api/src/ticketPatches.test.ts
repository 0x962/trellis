import { expect, test } from "bun:test";
import type { SearchOutput } from "./schemas/search.ts";
import type { TicketSummary } from "./schemas/ticket.ts";
import { holdsTicketRow, patchTicketQuery, ticketRows } from "./ticketPatches.ts";

const first = { id: "first", version: 1, title: "Original" } as TicketSummary;
const last = { id: "last", version: 1, title: "Original" } as TicketSummary;
const page = (tickets: TicketSummary[], nextOffset: number | null): SearchOutput => ({
	tickets,
	pages: [],
	projects: [],
	nextOffset,
});

test("reads and patches ticket rows on every search page while preserving pagination", () => {
	const key = [["search", "query"], { type: "infinite", input: { q: "original" } }];
	const data = { pages: [page([first], 20), page([last], null)], pageParams: [0, 20] };
	const changed = { ...last, version: 2, title: "Changed" };
	expect(ticketRows(key, data)).toEqual([first, last]);
	expect(holdsTicketRow(key, data, last.id)).toBe(true);
	expect(patchTicketQuery(key, data, { summary: changed, fields: ["title"], deleted: false })).toEqual({
		pages: [page([first], 20), page([changed], null)],
		pageParams: [0, 20],
	});
	expect(patchTicketQuery(key, data, { summary: last, fields: [], deleted: true })).toEqual({
		pages: [page([first], 20), page([], null)],
		pageParams: [0, 20],
	});
	expect(patchTicketQuery(key, data, { summary: last, fields: [], deleted: false })).toBeUndefined();
});

test("keeps ordinary search cache patches compatible", () => {
	const key = [["search", "query"], { type: "query", input: { q: "original" } }];
	const data = page([first], 20);
	expect(ticketRows(key, data)).toEqual([first]);
	expect(patchTicketQuery(key, data, { summary: first, fields: [], deleted: true })).toEqual(page([], 20));
});
