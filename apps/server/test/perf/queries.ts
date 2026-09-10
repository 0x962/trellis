import type { ListQueryInput, TrellisClient } from "@trellis/api";

// The requests the perf suite sends, in the API form the web and the CLI
// use. The seed names its roots AAA, BBB, and CCC.

// The default table query: one root and its subprojects, the open
// categories, newest first, one page of 50.
export const TABLE_QUERY: ListQueryInput = { project: "AAA", category: ["todo", "started", "review"], limit: 50 };

// One round of the reads a person causes: the table, the table with a
// filter word, the board, the counts, and three kinds of search.
export const READ_MIX: Array<(client: TrellisClient) => Promise<unknown>> = [
	(client) => client.tickets.list(TABLE_QUERY),
	(client) => client.tickets.list({ ...TABLE_QUERY, q: "billing" }),
	(client) => client.tickets.board({ project: "AAA" }),
	(client) => client.tickets.counts({ project: "AAA" }),
	(client) => client.search.query({ q: "billing" }),
	(client) => client.search.query({ q: "bill" }),
	(client) => client.search.query({ q: "AAA-42" }),
];
