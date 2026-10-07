import { hashKey, type QueryKey } from "@tanstack/react-query";
import type { BoardOutput, BoardQueryInput } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { BoardColumnModel } from "../../../types";
import { boardSort } from "../../constants";

export type ShowMoreOptions = {
	filters: BoardQueryInput;
	project?: string;
	boardKey: QueryKey;
};

type ColumnPage = { cursor?: string | null; pending: boolean };

export const useShowMore = ({ filters, project, boardKey }: ShowMoreOptions) => {
	const context = useApp();
	const identity = hashKey([boardKey, filters, project]);
	const queryHash = hashKey(boardKey);
	const scope = useMemo(
		() => ({ identity, pages: new Map<string, ColumnPage>(), generation: 0, active: false }),
		[identity],
	);
	const currentScope = useRef(scope);
	const appending = useRef(false);
	const [, refresh] = useReducer((value: number) => value + 1, 0);

	useLayoutEffect(() => {
		currentScope.current = scope;
		scope.active = true;
		const unsubscribe = context.queryClient.getQueryCache().subscribe((event) => {
			if (event.type !== "updated" || event.query.queryHash !== queryHash) return;
			if (event.action.type !== "success" || appending.current) return;
			scope.generation += 1;
			scope.pages.clear();
			refresh();
		});
		return () => {
			unsubscribe();
			scope.active = false;
			scope.generation += 1;
		};
	}, [context.queryClient, queryHash, scope]);

	const hasMore = (column: BoardColumnModel) => {
		const page = scope.pages.get(column.id);
		return page?.cursor === undefined ? column.items.length < column.count : page.cursor !== null;
	};

	const showMore = async (column: BoardColumnModel) => {
		if (!scope.active || currentScope.current !== scope || !hasMore(column)) return;
		const state = scope.pages.get(column.id) ?? { pending: false };
		if (state.pending) return;
		state.pending = true;
		scope.pages.set(column.id, state);
		refresh();
		const generation = scope.generation;
		const isCurrent = () => currentScope.current === scope && scope.generation === generation;
		const input = {
			...filters,
			project,
			...(project === undefined
				? { category: [column.category] }
				: { status: column.statuses.map((status) => status.slug) }),
			sort: boardSort,
			limit: 100,
		};
		try {
			if (state.cursor === undefined) {
				const first = await context.client.tickets.list(input);
				if (!isCurrent()) return;
				state.cursor = first.nextCursor;
			}
			if (state.cursor === null) return;
			const page = await context.client.tickets.list({ ...input, cursor: state.cursor });
			if (!isCurrent()) return;
			state.cursor = page.nextCursor;
			appending.current = true;
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
			appending.current = false;
		} catch (error) {
			if (!isCurrent()) return;
			toast.error("The column did not load more tickets.", {
				description: error instanceof Error ? error.message : String(error),
				action: { label: "Retry", onClick: () => void showMore(column) },
			});
		} finally {
			if (isCurrent()) {
				state.pending = false;
				refresh();
			}
		}
	};

	return { showMore, hasMore, isPending: (column: BoardColumnModel) => scope.pages.get(column.id)?.pending ?? false };
};
