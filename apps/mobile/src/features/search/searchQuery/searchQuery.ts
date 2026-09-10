import { TicketRefSchema } from "@trellis/api";

// The rows one search asks for.
export const searchLimit = 20;

// The canonical identifier a query names, or null when the query is not one
// complete identifier. A person who types CDE-42 reaches that ticket; every
// other query is a text search.
export const identifierOf = (query: string): string | null => {
	const ref = TicketRefSchema.safeParse(query.trim());
	if (!ref.success || ref.data.kind !== "identifier") return null;
	return `${ref.data.key}-${ref.data.number}`;
};

// True when a query holds a character the server can search for.
export const isSearchable = (query: string): boolean => query.trim().length > 0;
