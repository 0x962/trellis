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

// The rows one group adds each time the end of its list comes into view.
// Each drawn row of a native run asks the server for the Git state of its
// workspace, and the server runs Git for every one of those reads, so this
// number is the count of reads that one reveal starts.
export const SESSION_REVEAL_STEP = 30;

// The runs one group draws. `limit` holds the rows the person has reached
// by scrolling. The selected run is always drawn, because the page puts the
// conversation of that run beside the list, and a person who opens a link to
// an old run must see which row is open.
export function visibleSessions<T extends { id: string }>(runs: T[], limit: number, selectedId?: string) {
	const visible = runs.slice(0, limit);
	const selected = runs.find((run) => run.id === selectedId);
	if (selected !== undefined && !visible.includes(selected)) visible.push(selected);
	return visible;
}

// The next value of `limit` when the end of the list comes into view. The
// value stops at the number of runs the group holds. A limit that has
// reached that number returns itself, so the reveal stops and React starts
// no further render from the same state.
export function nextSessionLimit(limit: number, total: number) {
	return Math.min(limit + SESSION_REVEAL_STEP, total);
}
