import type { PageSummary, ProjectSummary, TicketSummary } from "@trellis/api";

// What the server answered for one query. `nextOffset` holds a number when
// the server found more matches than this answer carries.
export type SearchData = {
	tickets: readonly TicketSummary[];
	pages: readonly PageSummary[];
	projects: readonly ProjectSummary[];
	nextOffset: number | null;
};

// The two lines a rejected call shows, as `describeError` returns them.
// `unreachable` is true when the request got no answer at all.
export type SearchFailure = { title: string; detail: string; unreachable: boolean };

// Where the call for the text in the field stands. `idle` means the screen
// asked for nothing, because the field is empty.
export type SearchRequest =
	| { state: "idle" }
	| { state: "waiting" }
	| { state: "failed"; failure: SearchFailure }
	| { state: "answered"; data: SearchData };

// The one thing the screen draws under the search field.
export type SearchView =
	| { kind: "prompt" }
	| { kind: "recents"; recents: readonly string[] }
	| { kind: "waiting"; query: string }
	| { kind: "failed"; failure: SearchFailure }
	| { kind: "empty"; query: string }
	| { kind: "results"; data: SearchData };

export type SearchViewInput = {
	// The text the screen sent to the server, without its outer spaces.
	query: string;
	request: SearchRequest;
	recents: readonly string[];
};

// "1 ticket", "3 tickets". Every noun this screen counts takes a plain `s`.
export const countOf = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

// The one view for one set of inputs. An empty field shows the stored
// queries, and a field with text shows the state of its call.
export const searchView = ({ query, request, recents }: SearchViewInput): SearchView => {
	if (query === "" || request.state === "idle") {
		return recents.length === 0 ? { kind: "prompt" } : { kind: "recents", recents };
	}
	if (request.state === "waiting") return { kind: "waiting", query };
	if (request.state === "failed") return { kind: "failed", failure: request.failure };
	const { tickets, pages, projects } = request.data;
	const matches = tickets.length + pages.length + projects.length;
	return matches === 0 ? { kind: "empty", query } : { kind: "results", data: request.data };
};

// The counted kinds of one answer, in the order the list draws them.
const matchCounts = (data: SearchData): string[] => {
	const kinds: readonly (readonly [number, string])[] = [
		[data.tickets.length, "ticket"],
		[data.projects.length, "project"],
		[data.pages.length, "Page"],
	];
	return kinds.filter(([count]) => count > 0).map(([count, noun]) => countOf(count, noun));
};

// The sentence a screen reader speaks when the screen settles on one view.
// A waiting search says nothing: a letter typed into the field starts the
// next search, so a reader that speaks each step talks over itself.
export const searchStatus = (view: SearchView): string | undefined => {
	if (view.kind === "failed") return `${view.failure.title}. ${view.failure.detail}`;
	if (view.kind === "empty") return `Nothing matches ${view.query}.`;
	if (view.kind !== "results") return undefined;
	const counts = matchCounts(view.data).join(", ");
	const more = view.data.nextOffset === null ? "" : " More matches exist.";
	return `Results for ${view.query}: ${counts}.${more}`;
};
