import type { QueryKey } from "@tanstack/react-query";
import type { BoardOutput, BoardQueryInput, ListOutput } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { BoardColumnModel } from "../../../types";
import { boardSort } from "../../constants";

export type ShowMoreOptions = {
	// The filters of the board query. The page of a column carries the same
	// ones, so the new cards pass the filters the board shows.
	filters: BoardQueryInput;
	// The project ref of the route, or undefined on a board of every project.
	project?: string;
	// The cache key of the board query. A loaded page joins the columns
	// under that key.
	boardKey: QueryKey;
};

// Loads the next page of one column. Each column holds its own cursor, so
// two columns page apart. A column of a board without a project asks for a
// status category, and a column of a project board asks for its statuses.
export const useShowMore = ({ filters, project, boardKey }: ShowMoreOptions) => {
	const context = useApp();
	const [cursors, setCursors] = useState<Record<string, string | null>>({});

	const showMore = async (column: BoardColumnModel) => {
		const input = {
			...filters,
			project,
			...(project === undefined
				? { category: [column.category] }
				: { status: column.statuses.map((status) => status.slug) }),
			sort: boardSort,
			limit: 100,
		};
		let cursor = cursors[column.id];
		let page: ListOutput;
		try {
			if (cursor === undefined) cursor = (await context.client.tickets.list(input)).nextCursor;
			if (cursor === null) return;
			page = await context.client.tickets.list({ ...input, cursor });
		} catch (error) {
			toast.error("The column did not load more tickets.", {
				description: error instanceof Error ? error.message : String(error),
				action: { label: "Retry", onClick: () => void showMore(column) },
			});
			return;
		}
		setCursors((current) => ({ ...current, [column.id]: page.nextCursor }));
		context.queryClient.setQueryData<BoardOutput>(boardKey, (current) => ({
			columns: current!.columns.map((entry) => ({
				...entry,
				items: [
					...entry.items,
					...page.items.filter(
						(ticket) => ticket.status.id === entry.statusId && !entry.items.some((item) => item.id === ticket.id),
					),
				],
			})),
		}));
	};

	return showMore;
};
