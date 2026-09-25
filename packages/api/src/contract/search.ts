import { pickErrors } from "../errors.ts";
import { SearchOutputSchema, SearchQuerySchema } from "../schemas/search.ts";
import { base } from "./base.ts";

export const search = {
	query: base
		.errors(pickErrors(["SEARCH_REPLACED"]))
		.route({ method: "GET", path: "/search", summary: "Search tickets, Pages, and projects" })
		.input(SearchQuerySchema)
		.output(SearchOutputSchema),
};
