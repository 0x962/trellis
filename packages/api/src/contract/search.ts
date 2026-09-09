import { SearchOutputSchema, SearchQuerySchema } from "../schemas/search.ts";
import { base } from "./base.ts";

export const search = {
	query: base
		.route({ method: "GET", path: "/search", summary: "Search tickets and projects" })
		.input(SearchQuerySchema)
		.output(SearchOutputSchema),
};
