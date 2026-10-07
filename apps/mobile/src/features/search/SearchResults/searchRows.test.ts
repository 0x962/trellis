import { describe, expect, test } from "bun:test";
import type { PageSummary, ProjectSummary, TicketSummary } from "@trellis/api";
import type { SearchData } from "../searchView";
import { moreMatchesNote, pagesNote, searchRowKey, searchRows } from "./searchRows";

const ticket = { id: "ticket-1", identifier: "CDE-42" } as TicketSummary;
const project = { id: "project-1", key: "CDE" } as ProjectSummary;
const page = { id: "page-1", ref: "CDE/pages/plan" } as PageSummary;

const data = (over: Partial<SearchData> = {}): SearchData => ({
	tickets: [],
	projects: [],
	pages: [],
	nextOffset: null,
	...over,
});

describe("searchRows", () => {
	test("heads every group it holds and counts it", () => {
		expect(searchRows(data({ tickets: [ticket], projects: [project], pages: [page] }))).toEqual([
			{ kind: "header", label: "Tickets", count: 1 },
			{ kind: "ticket", ticket },
			{ kind: "header", label: "Projects", count: 1 },
			{ kind: "project", project },
			{ kind: "header", label: "Pages", count: 1, note: pagesNote },
			{ kind: "page", page },
		]);
	});

	test("leaves out a group the answer holds nothing for", () => {
		expect(searchRows(data({ tickets: [ticket] }))).toEqual([
			{ kind: "header", label: "Tickets", count: 1 },
			{ kind: "ticket", ticket },
		]);
	});

	test("says that more matches exist when the server cut the list short", () => {
		expect(searchRows(data({ tickets: [ticket], nextOffset: 20 })).at(-1)).toEqual({
			kind: "note",
			text: moreMatchesNote,
		});
	});

	test("says nothing about more matches when the answer holds every match", () => {
		expect(searchRows(data({ tickets: [ticket] })).some((row) => row.kind === "note")).toBe(false);
	});

	test("tells a Page result where it opens", () => {
		const header = searchRows(data({ pages: [page] }))[0];

		expect(header).toEqual({ kind: "header", label: "Pages", count: 1, note: pagesNote });
	});

	test("keeps an empty answer empty", () => {
		expect(searchRows(data())).toEqual([]);
	});
});

describe("searchRowKey", () => {
	test("gives one key to each row of a mixed list", () => {
		const keys = searchRows(data({ tickets: [ticket], projects: [project], pages: [page], nextOffset: 20 })).map(
			searchRowKey,
		);

		expect(new Set(keys).size).toBe(keys.length);
	});
});
