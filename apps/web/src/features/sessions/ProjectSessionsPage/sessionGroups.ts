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
