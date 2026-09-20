import type { TicketPr, TicketSummary } from "@trellis/api";
import type { AgentLineText } from "../agentLines";
import type { RowGroup } from "../groupRows";

// A group as the table renders it: the rows it holds and, for a closed
// group, the paging it owns.
export type TableGroup = RowGroup & {
	// The count the header shows. A closed group counts the server's rows,
	// loaded or not.
	count: number;
	// The text the count slot prints in place of `count`, such as the `3/11`
	// done and total counts of a milestone.
	countLabel?: string;
	// The word of the `Badge` after the label, such as Current.
	badge?: string;
	// A muted word beside the count, such as Later.
	note?: string;
	// The ref of the epic that every row of the table belongs to. A new
	// ticket from the header of the group joins this epic, and the milestone
	// of the group.
	epicRef?: string;
	expanded: boolean;
	// A closed group has more pages on the server.
	hasMore?: boolean;
	loadMore?: () => void;
	loading?: boolean;
};

// One line of the virtual list.
export type TableItem =
	| { kind: "header"; key: string; group: TableGroup }
	| { kind: "row"; key: string; group: TableGroup; ticket: TicketSummary }
	| { kind: "agent"; key: string; group: TableGroup; line: AgentLineText }
	| { kind: "pr"; key: string; group: TableGroup; pr: TicketPr }
	| { kind: "more"; key: string; group: TableGroup };

export type FlattenOptions = {
	// True on the epic route: a ticket row is followed by one line per pull
	// request linked to that ticket. False everywhere else, where the list
	// holds ticket rows alone.
	prRows?: boolean;
	// What the run of a ticket says, by ticket id. A ticket with no entry
	// has no run, or its run has neither an open request nor a message, and
	// it gets no agent line.
	agentLines?: ReadonlyMap<string, AgentLineText>;
};

// The lines in order: each group's header, its rows while it is expanded,
// the agent line of each row when `agentLines` holds one for it, the pull
// requests of each row when `prRows` asks for them, and its "show more"
// line while a page waits on the server.
export const flattenGroups = (groups: readonly TableGroup[], options: FlattenOptions = {}): TableItem[] => {
	const items: TableItem[] = [];
	for (const group of groups) {
		if (group.label !== null) items.push({ kind: "header", key: `header:${group.key}`, group });
		if (!group.expanded) continue;
		for (const ticket of group.rows) {
			items.push({ kind: "row", key: ticket.id, group, ticket });
			const line = options.agentLines?.get(ticket.id);
			if (line !== undefined) items.push({ kind: "agent", key: `agent:${ticket.id}`, group, line });
			if (options.prRows !== true) continue;
			// Two tickets can link the same pull request, so the ticket id is
			// part of the key that the virtualizer uses to hold a line.
			for (const pr of ticket.prRows)
				items.push({ kind: "pr", key: `pr:${ticket.id}:${pr.owner}/${pr.repo}#${pr.number}`, group, pr });
		}
		if (group.hasMore) items.push({ kind: "more", key: `more:${group.key}`, group });
	}
	return items;
};
