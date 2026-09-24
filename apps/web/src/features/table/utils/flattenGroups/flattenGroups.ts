import type { TicketPr, TicketSummary } from "@trellis/api";
import type { TicketAgentLine } from "../agentLines";
import type { RowGroup } from "../groupRows";

// A group as the table renders it: the rows it holds and, for a closed
// group, the paging it owns.
export type TableGroup = RowGroup & {
	// The count the header shows. A closed group counts the server's rows,
	// loaded or not.
	count: number;
	// The text the count slot prints in place of `count`, such as the `3/11`
	// done and total counts of a wave.
	countLabel?: string;
	// The counts that set the progress circle of a wave group.
	completedCount?: number;
	totalCount?: number;
	// The rows of the group whose turn is the person. The header prints it
	// after the count.
	forYou?: number;
	// True when every ticket of the group is done or canceled.
	done?: boolean;
	// The ref of the epic that every row of the table belongs to. A new
	// ticket from the header of the group joins this epic, and the wave
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
	// The line of the ticket's run, for the phone row.
	| {
			kind: "row";
			key: string;
			group: TableGroup;
			ticket: TicketSummary;
			agentLine: TicketAgentLine | null;
			disclosure: TicketDisclosure;
			// True when child lines follow the row. The row then starts the
			// tree rule under its status icon and draws no bottom border.
			hasChildLines: boolean;
	  }
	// The agent line is the last child line of its ticket, so `last` is
	// true: the line draws the bottom border of the group.
	//
	// `depth` is 1 when the agent line hangs from the ticket row, and 2 when
	// it hangs from a pull request line. The line draws its tree rule under
	// its parent, so the depth sets how far from the left edge the rule and
	// the words sit.
	| { kind: "agent"; key: string; group: TableGroup; line: TicketAgentLine; last: boolean; depth: AgentLineDepth }
	// `last` is true on the last pull request line of the ticket. That line
	// ends the tree rule of the ticket with a corner.
	//
	// `hasChildLines` is true on the pull request line that the agent line
	// hangs from. That line carries the tree rule down to its bottom edge
	// and leaves the bottom border of the group to the line under it.
	| { kind: "pr"; key: string; group: TableGroup; pr: TicketPr; last: boolean; hasChildLines: boolean }
	| { kind: "more"; key: string; group: TableGroup }
	// The one line under the header of a wave that holds no ticket.
	| { kind: "empty"; key: string; group: TableGroup };

export type FlattenOptions = {
	// True on the epic route: a ticket row is followed by one line per pull
	// request linked to that ticket. False everywhere else, where the list
	// holds ticket rows alone.
	prRows?: boolean;
	// What the run of a ticket says, keyed by ticket id. A ticket with no
	// entry has no run, or its run has neither an open request nor a
	// message, and it gets no agent line.
	agentLines?: Readonly<Record<string, TicketAgentLine>>;
	// The done or canceled tickets whose child rows a person opened.
	expandedTickets?: readonly string[];
};

export type TicketDisclosure = "collapsed" | "expanded" | null;

export type AgentLineDepth = 1 | 2;

const ticketDisclosure = (ticket: TicketSummary, hasChildren: boolean, expandedTickets: readonly string[]) => {
	if (!hasChildren || (ticket.status.category !== "done" && ticket.status.category !== "canceled")) return null;
	return expandedTickets.includes(ticket.id) ? "expanded" : "collapsed";
};

// A ticket shows its open work first and its finished work last: the open,
// draft and queued pull requests, then the closed ones, then the merged
// ones. `Array.prototype.sort` is stable, so two pull requests in the same
// state keep the order the server sent.
const prRank = (pr: TicketPr) => (pr.state === "merged" ? 2 : pr.state === "closed" ? 1 : 0);
const sortTicketPrs = (prs: readonly TicketPr[]) => [...prs].sort((a, b) => prRank(a) - prRank(b));

// The lines in order: each group's header, its rows while it is expanded
// (or one empty line under a wave that holds no row),
// the pull requests of each row when `prRows` asks for them, the agent line
// of each row when `agentLines` holds one for it, and its "show more" line
// while a page waits on the server. The pull requests of one ticket stand in
// one block, and the agent line of that ticket follows the last of them.
export const flattenGroups = (groups: readonly TableGroup[], options: FlattenOptions = {}): TableItem[] => {
	const items: TableItem[] = [];
	for (const group of groups) {
		if (group.label !== null) items.push({ kind: "header", key: `header:${group.key}`, group });
		if (!group.expanded) continue;
		if (group.wave !== undefined && group.rows.length === 0) {
			items.push({ kind: "empty", key: `empty:${group.key}`, group });
			continue;
		}
		for (const ticket of group.rows) {
			const line = options.agentLines?.[ticket.id];
			const hasPrRows = options.prRows === true && ticket.prRows.length > 0;
			const hasChildren = hasPrRows || line !== undefined;
			const disclosure = ticketDisclosure(ticket, hasChildren, options.expandedTickets ?? []);
			const hasChildLines = hasChildren && disclosure !== "collapsed";
			items.push({ kind: "row", key: ticket.id, group, ticket, agentLine: line ?? null, disclosure, hasChildLines });
			if (!hasChildLines) continue;
			if (hasPrRows) {
				const prs = sortTicketPrs(ticket.prRows);
				prs.forEach((pr, index) => {
					// Two tickets can link the same pull request, so the ticket id is
					// part of the key that the virtualizer uses to hold a line.
					const key = `pr:${ticket.id}:${pr.owner}/${pr.repo}#${pr.number}`;
					const last = index === prs.length - 1;
					items.push({ kind: "pr", key, group, pr, last, hasChildLines: last && line !== undefined });
				});
				// The agent line hangs from the last pull request line, so no
				// pull request of the ticket comes after the words of its run.
				if (line !== undefined) {
					items.push({ kind: "agent", key: `agent:${ticket.id}`, group, line, last: true, depth: 2 });
				}
				continue;
			}
			// A ticket that links no pull request hangs its agent line from the
			// ticket row itself.
			if (line !== undefined) {
				items.push({ kind: "agent", key: `agent:${ticket.id}`, group, line, last: true, depth: 1 });
			}
		}
		if (group.hasMore) items.push({ kind: "more", key: `more:${group.key}`, group });
	}
	return items;
};

// The lines below 768 px. A phone row shows the run's words or a pull
// request on its own second line, so this removes the agent lines and the
// pull request lines.
export const phoneItems = (items: readonly TableItem[]): TableItem[] =>
	items.filter((item) => item.kind !== "agent" && item.kind !== "pr");
