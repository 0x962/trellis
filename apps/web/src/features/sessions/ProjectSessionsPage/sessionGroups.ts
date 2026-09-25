import type { AgentRun } from "@trellis/api";

export const SESSION_ARCHIVE_AFTER_MS = 48 * 60 * 60 * 1000;

type GroupableRun = Pick<
	AgentRun,
	"id" | "name" | "kind" | "ticketId" | "ticketIdentifier" | "ticketTitle" | "pinnedAt" | "activityAt" | "createdAt"
>;

export const isAutomaticallyArchived = (run: Pick<GroupableRun, "pinnedAt" | "activityAt">) =>
	run.pinnedAt === null &&
	run.activityAt !== null &&
	Date.now() - Date.parse(run.activityAt) >= SESSION_ARCHIVE_AFTER_MS;

export const nextSessionArchiveTimeMs = (runs: Array<Pick<GroupableRun, "pinnedAt" | "activityAt">>) => {
	const now = Date.now();
	const times = runs.flatMap((run) => {
		if (run.pinnedAt !== null || run.activityAt === null) return [];
		const archiveTimeMs = Date.parse(run.activityAt) + SESSION_ARCHIVE_AFTER_MS;
		return archiveTimeMs > now ? [archiveTimeMs] : [];
	});
	return times.length === 0 ? null : Math.min(...times);
};

export function sessionGroups<T extends GroupableRun>(runs: T[], options: { search: string; showArchived: boolean }) {
	const query = options.search.trim().toLocaleLowerCase();
	const matches = runs
		.filter((run) => isAutomaticallyArchived(run) === options.showArchived)
		.filter((run) => {
			if (!query) return true;
			return [run.name, run.ticketIdentifier, run.ticketTitle, run.activityAt, run.createdAt].some((value) =>
				value?.toLocaleLowerCase().includes(query),
			);
		});
	matches.sort(
		(a, b) =>
			Number(b.pinnedAt !== null) - Number(a.pinnedAt !== null) ||
			(b.activityAt ?? "").localeCompare(a.activityAt ?? "") ||
			b.id.localeCompare(a.id),
	);
	return {
		runs: matches,
	};
}

export function selectedSession<T extends { id: string }>(
	runs: T[],
	ordered: T[],
	requestedId: string,
	heldId?: string,
) {
	if (requestedId) return runs.find((run) => run.id === requestedId);
	return runs.find((run) => run.id === heldId) ?? ordered[0] ?? runs[0];
}

// The box one row of the session list takes: the 44 px row of the sidebar
// and the 2 px space under it. Every row of the list has these two lines,
// so one number answers for all of them, and the height of the list never
// changes as rows come into the tree and leave it.
export const SESSION_ROW_HEIGHT = 46;

// The place of each named run in the session list. A poll refreshes
// that list every two seconds, and a run can move or leave it, so a caller
// that holds a run over several renders holds its ID and reads its place
// again on each render. A run the list no longer holds gives -1.
export function keptSessionRows<T extends { id: string }>(runs: T[], ids: (string | undefined)[]) {
	return ids.map((id) => runs.findIndex((run) => run.id === id));
}

// The rows the list draws, on top of the rows that the scroll position
// asks for. `keep` holds the place of the selected row and of the row that
// holds the keyboard focus. A row that leaves the tree takes the focus
// with it, so the list holds both of those rows at any scroll position.
// A place of -1 names no row, and the list drops it.
export function sessionRowRange(range: number[], keep: number[]) {
	return [...new Set([...range, ...keep.filter((index) => index >= 0)])].sort((a, b) => a - b);
}

// The row that takes the keyboard focus when the Tab key leaves a drawn
// row. `null` means the browser moves the focus itself. The next row is
// already in the tree, the focus leaves the list, or the run is gone.
export function nextSessionRow(input: { focused: number; total: number; back: boolean; drawn: number[] }) {
	if (input.focused < 0) return null;
	const next = input.focused + (input.back ? -1 : 1);
	if (next < 0 || next >= input.total) return null;
	if (input.drawn.includes(next)) return null;
	return next;
}
