// The fixtures of the flattenGroups tests. Two test files read them:
// `flattenGroups.test.ts` for the order of the lines, and
// `flattenGroupsTree.test.ts` for the tree rules and the phone list.

import type { TicketPr, TicketSummary } from "@trellis/api";
import type { TicketAgentLine } from "../agentLines";
import type { TableGroup } from "./flattenGroups";

export const pr = (number: number) => ({ number, owner: "0x962", repo: "trellis" }) as TicketPr;

// One pull request in a named state. `pr` leaves the state out, and the
// order then reads it as open.
export const prIn = (number: number, state: TicketPr["state"]) =>
	({ number, owner: "0x962", repo: "trellis", state }) as TicketPr;

export const ticket = (
	id: string,
	prRows: TicketPr[] = [],
	category: TicketSummary["status"]["category"] = "started",
) => ({ id, prRows, status: { category } }) as TicketSummary;

export const line = (words: string, asks = false): TicketAgentLine => ({
	words,
	asks,
	working: false,
	runId: "run",
});

export const group = (key: string, expanded: boolean, rows: TicketSummary[]) =>
	({ key, label: key, expanded, count: rows.length, rows }) as TableGroup;
