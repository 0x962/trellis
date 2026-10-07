import { describe, expect, test } from "bun:test";
import type { PageSummary, ProjectSummary, TicketSummary } from "@trellis/api";
import { countOf, type SearchData, type SearchFailure, searchStatus, searchView } from "./searchView";

const ticket = { id: "ticket-1" } as TicketSummary;
const project = { id: "project-1" } as ProjectSummary;
const page = { id: "page-1" } as PageSummary;

const data = (over: Partial<SearchData> = {}): SearchData => ({
	tickets: [],
	projects: [],
	pages: [],
	nextOffset: null,
	...over,
});

const failure: SearchFailure = { title: "The server sent an error", detail: "Enter the text to search for.", unreachable: false };

describe("searchView", () => {
	test("offers the stored queries while the field is empty", () => {
		expect(searchView({ query: "", request: { state: "idle" }, recents: ["crisp"] })).toEqual({
			kind: "recents",
			recents: ["crisp"],
		});
	});

	test("asks for a search when the field is empty and no query is stored", () => {
		expect(searchView({ query: "", request: { state: "idle" }, recents: [] })).toEqual({ kind: "prompt" });
	});

	test("names the query it waits for", () => {
		expect(searchView({ query: "crisp", request: { state: "waiting" }, recents: ["crisp"] })).toEqual({
			kind: "waiting",
			query: "crisp",
		});
	});

	test("shows the reason the server sent", () => {
		expect(searchView({ query: "crisp", request: { state: "failed", failure }, recents: [] })).toEqual({
			kind: "failed",
			failure,
		});
	});

	test("says that nothing matches when every group is empty", () => {
		expect(searchView({ query: "crisp", request: { state: "answered", data: data() }, recents: [] })).toEqual({
			kind: "empty",
			query: "crisp",
		});
	});

	test("holds results when only a Page matches", () => {
		const answer = data({ pages: [page] });

		expect(searchView({ query: "plan", request: { state: "answered", data: answer }, recents: [] })).toEqual({
			kind: "results",
			query: "plan",
			data: answer,
		});
	});

	test("holds results when only a project matches", () => {
		const answer = data({ projects: [project] });

		expect(searchView({ query: "demo", request: { state: "answered", data: answer }, recents: [] })).toEqual({
			kind: "results",
			query: "demo",
			data: answer,
		});
	});
});

describe("countOf", () => {
	test("counts one and many", () => {
		expect([countOf(1, "ticket"), countOf(2, "ticket"), countOf(0, "Page")]).toEqual([
			"1 ticket",
			"2 tickets",
			"0 Pages",
		]);
	});
});

describe("searchStatus", () => {
	test("counts every group the answer holds", () => {
		const view = searchView({
			query: "crisp",
			request: { state: "answered", data: data({ tickets: [ticket, ticket], projects: [project], pages: [page] }) },
			recents: [],
		});

		expect(searchStatus(view)).toBe("Results for crisp: 2 tickets, 1 project, 1 Page.");
	});

	test("leaves out a group the answer holds nothing for", () => {
		const view = searchView({
			query: "crisp",
			request: { state: "answered", data: data({ tickets: [ticket] }) },
			recents: [],
		});

		expect(searchStatus(view)).toBe("Results for crisp: 1 ticket.");
	});

	test("says that more matches exist when the server cut the list short", () => {
		const view = searchView({
			query: "crisp",
			request: { state: "answered", data: data({ tickets: [ticket], nextOffset: 20 }) },
			recents: [],
		});

		expect(searchStatus(view)).toBe("Results for crisp: 1 ticket. More matches exist.");
	});

	test("speaks the title and the reason of a rejected call", () => {
		const view = searchView({ query: "crisp", request: { state: "failed", failure }, recents: [] });

		expect(searchStatus(view)).toBe("The server sent an error. Enter the text to search for.");
	});

	test("speaks an empty answer", () => {
		const view = searchView({ query: "crisp", request: { state: "answered", data: data() }, recents: [] });

		expect(searchStatus(view)).toBe("Nothing matches crisp.");
	});

	test("stays silent while a search waits and while the field is empty", () => {
		const waiting = searchView({ query: "crisp", request: { state: "waiting" }, recents: [] });
		const recents = searchView({ query: "", request: { state: "idle" }, recents: ["crisp"] });
		const prompt = searchView({ query: "", request: { state: "idle" }, recents: [] });

		expect([searchStatus(waiting), searchStatus(recents), searchStatus(prompt)]).toEqual([
			undefined,
			undefined,
			undefined,
		]);
	});
});
