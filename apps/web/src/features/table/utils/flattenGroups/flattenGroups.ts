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
	// The word of the `Badge` after the label, such as Current.
	badge?: string;
	// The rows of the group whose turn is the person. The header prints it
	// after the count.
	forYou?: number;
	// A muted word beside the count, such as Later.
	note?: string;
	// True when every ticket of the group is done or canceled. The header
	// then draws the double check.
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
	// `last` is true on the final child line of its parent. That line ends
	// the tree rule with a corner.
	//
	// `depth` is 1 when the agent line hangs from the ticket row, and 2 when
	// it hangs from a pull request line. The line draws its tree rule under
	// its parent, so the depth sets how far from the left edge the rule and
	// the words sit.
	| { kind: "agent"; key: string; group: TableGroup; line: TicketAgentLine; last: boolean; depth: AgentLineDepth }
	// `hasChildLines` is true on the pull request line that the agent line
	// hangs from. That line carries the tree rule down to its bottom edge
	// and leaves the bottom border of the group to the agent line.
	| { kind: "pr"; key: string; group: TableGroup; pr: TicketPr; last: boolean; hasChildLines: boolean }
	| { kind: "more"; key: string; group: TableGroup };

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

// A ticket's pull requests show open work first and merged work last:
// open, draft and queued pull requests, then closed ones, then merged ones.
// The sort is stable, so each state keeps the order the server sent.
const prRank = (pr: TicketPr) => (pr.state === "merged" ? 2 : pr.state === "closed" ? 1 : 0);
const sortTicketPrs = (prs: readonly TicketPr[]) => [...prs].sort((a, b) => prRank(a) - prRank(b));

// The lines in order: each group's header, its rows while it is expanded,
// the pull requests of each row when `prRows` asks for them, the agent line
// of each row when `agentLines` holds one for it, and its "show more" line
// while a page waits on the server.
export const flattenGroups = (groups: readonly TableGroup[], options: FlattenOptions = {}): TableItem[] => {
	const items: TableItem[] = [];
	for (const group of groups) {
		if (group.label !== null) items.push({ kind: "header", key: `header:${group.key}`, group });
		if (!group.expanded) continue;
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
				// The agent line hangs from the newest open pull request, the work
				// the agent does now. That is the last open one, because the server
				// orders a ticket's pull requests by the time each was linked. With
				// no open pull request it hangs from the last line.
				const openCount = prs.filter((pr) => prRank(pr) === 0).length;
				const anchor = openCount > 0 ? openCount - 1 : prs.length - 1;
				prs.forEach((pr, index) => {
					const last = index === prs.length - 1;
					const hasAgent = index === anchor && line !== undefined;
					// Two tickets can link the same pull request, so the ticket id is
					// part of the key that the virtualizer uses to hold a line.
					const key = `pr:${ticket.id}:${pr.owner}/${pr.repo}#${pr.number}`;
					items.push({ kind: "pr", key, group, pr, last, hasChildLines: hasAgent });
					if (hasAgent) items.push({ kind: "agent", key: `agent:${ticket.id}`, group, line, last, depth: 2 });
				});
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
