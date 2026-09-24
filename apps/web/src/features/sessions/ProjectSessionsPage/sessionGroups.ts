import type { AgentRun } from "@trellis/api";
import { isHistoricalSession } from "./isHistoricalSession";

type GroupableRun = Pick<
	AgentRun,
	| "id"
	| "name"
	| "kind"
	| "ticketId"
	| "ticketIdentifier"
	| "ticketTitle"
	| "assigned"
	| "ticketStatusCategory"
	| "createdAt"
>;

export function sessionGroups<T extends GroupableRun>(
	runs: T[],
	options: { search: string; history: boolean; selectedId?: string },
) {
	const query = options.search.trim().toLocaleLowerCase();
	const matches = runs.filter((run) => {
		if (query)
			return [run.name, run.ticketIdentifier, run.ticketTitle, run.createdAt].some((value) =>
				value?.toLocaleLowerCase().includes(query),
			);
		return options.history || !isHistoricalSession(run) || run.id === options.selectedId;
	});
	matches.sort(
		(a, b) =>
			Number(isHistoricalSession(a)) - Number(isHistoricalSession(b)) ||
			Number(b.kind === "session") - Number(a.kind === "session") ||
			b.createdAt.localeCompare(a.createdAt) ||
			b.id.localeCompare(a.id),
	);
	return {
		sessions: matches.filter((run) => run.ticketId === null),
		ticketed: matches.filter((run) => run.ticketId !== null),
		historyCount: runs.filter(isHistoricalSession).length,
	};
}

// The box one row of the session list takes: the 44 px row of the sidebar
// and the 2 px space under it. Every row of the list has these two lines,
// so one number answers for all of them, and the height of the list never
// changes as rows come into the tree and leave it.
export const SESSION_ROW_HEIGHT = 46;

// The rows the list draws, on top of the rows that the scroll position
// asks for. `keep` holds the selected row and the row that holds the
// keyboard focus. A row that leaves the tree takes the focus with it, so
// the list holds both of those rows at any scroll position.
export function sessionRowRange(range: number[], keep: (number | undefined)[]) {
	const kept = keep.filter((index): index is number => index !== undefined);
	return [...new Set([...range, ...kept])].sort((a, b) => a - b);
}

// The row that takes the keyboard focus when the Tab key leaves the last
// row in the tree. `null` means the browser moves the focus itself: the
// next row is already in the tree, or the focus leaves the list.
export function nextSessionRow(input: { focused: number; total: number; back: boolean; drawn: number[] }) {
	const next = input.focused + (input.back ? -1 : 1);
	if (next < 0 || next >= input.total) return null;
	if (input.drawn.includes(next)) return null;
	return next;
}
