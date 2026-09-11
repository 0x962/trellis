import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseSearch, stripDefaults } from "../features/filters/grammar";

// /all used to show the table, and the board sat at /all/board. The board is
// the bare path now, so this route only sends an older link to /all and
// keeps its filters. `/p/CDE/board` does the same for a project.
export const Route = createFileRoute("/all_/board")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/all", search, replace: true });
	},
});
