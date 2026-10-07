import type { PageSummary, ProjectSummary, TicketSummary } from "@trellis/api";
import type { SearchData } from "../searchView";

// The line under the Pages heading. This app has no screen that opens a
// Page, so a Page result names the place that does.
export const pagesNote = "Open a Page in Trellis on a computer.";

// The last line of a list the server cut short. `nextOffset` of the answer
// holds a number when more matches exist.
export const moreMatchesNote = "More matches exist. Add a word to narrow the search.";

// One line of the result list. A `header` starts a group and counts it. A
// `note` is a sentence that belongs to no single result.
export type SearchRow =
	| { kind: "header"; label: string; count: number; note?: string }
	| { kind: "ticket"; ticket: TicketSummary }
	| { kind: "project"; project: ProjectSummary }
	| { kind: "page"; page: PageSummary }
	| { kind: "note"; text: string };

// The key that holds one row to one result across a redraw.
export const searchRowKey = (row: SearchRow): string => {
	if (row.kind === "header") return `header:${row.label}`;
	if (row.kind === "ticket") return `ticket:${row.ticket.id}`;
	if (row.kind === "project") return `project:${row.project.id}`;
	if (row.kind === "page") return `page:${row.page.id}`;
	return `note:${row.text}`;
};

// The answer as one flat list: the tickets, then the projects, then the
// Pages, each group under a heading that counts it. A person opens a ticket
// and a project from this screen, so those two groups come first.
export const searchRows = (data: SearchData): SearchRow[] => {
	const rows: SearchRow[] = [];
	if (data.tickets.length > 0) {
		rows.push({ kind: "header", label: "Tickets", count: data.tickets.length });
		for (const ticket of data.tickets) rows.push({ kind: "ticket", ticket });
	}
	if (data.projects.length > 0) {
		rows.push({ kind: "header", label: "Projects", count: data.projects.length });
		for (const project of data.projects) rows.push({ kind: "project", project });
	}
	if (data.pages.length > 0) {
		rows.push({ kind: "header", label: "Pages", count: data.pages.length, note: pagesNote });
		for (const page of data.pages) rows.push({ kind: "page", page });
	}
	if (data.nextOffset !== null) rows.push({ kind: "note", text: moreMatchesNote });
	return rows;
};
