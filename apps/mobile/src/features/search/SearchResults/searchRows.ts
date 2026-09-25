import type { PageSummary, TicketSummary } from "@trellis/api";

export type SearchRow = { kind: "ticket"; ticket: TicketSummary } | { kind: "page"; page: PageSummary };

export const searchRows = (tickets: readonly TicketSummary[], pages: readonly PageSummary[]): SearchRow[] => [
	...tickets.map((ticket) => ({ kind: "ticket" as const, ticket })),
	...pages.map((page) => ({ kind: "page" as const, page })),
];
