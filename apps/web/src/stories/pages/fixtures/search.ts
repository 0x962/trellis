import type { SearchOutput, SearchQueryInput } from "@trellis/api";
import { page } from "./page";
import { failure, project, tickets } from "./project";

export const searchResults = ({ q }: SearchQueryInput): SearchOutput => {
	const query = q.toLowerCase();
	return {
		tickets: tickets.filter((ticket) => `${ticket.identifier} ${ticket.title}`.toLowerCase().includes(query)),
		projects: [project].filter((item) => `${item.key} ${item.name}`.toLowerCase().includes(query)),
		pages: [page].filter((item) => `${item.ref} ${item.title} ${item.summary}`.toLowerCase().includes(query)),
		nextOffset: null,
	};
};

export const searchPage = ({ offset = 0 }: SearchQueryInput): SearchOutput => ({
	tickets: offset === 0 ? tickets.slice(0, 2) : tickets.slice(2),
	projects: offset === 0 ? [project] : [],
	pages: offset === 0 ? [page] : [],
	nextOffset: offset === 0 ? 2 : null,
});

export const searchPageError = (input: SearchQueryInput): SearchOutput =>
	input.offset === 0 ? searchPage(input) : failure();
