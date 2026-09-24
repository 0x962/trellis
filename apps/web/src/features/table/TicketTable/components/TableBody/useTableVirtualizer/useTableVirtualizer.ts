import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { TicketSummary } from "@trellis/api";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { agentLineHeight, prRowHeight } from "../../../../rowHeights";
import type { TableItem } from "../../../../utils/flattenGroups";
import { showMoreHeight } from "../../ShowMoreRow";

export type TableVirtualizerOptions = {
	// The scroll container of the list.
	viewport: RefObject<HTMLDivElement | null>;
	items: readonly TableItem[];
	// The box of a ticket row and of a group header at the current density
	// and width.
	rowHeight: number;
	headerHeight: number;
	// The id of a row a key moved the focus to. The list scrolls it into
	// view and focuses it once it mounts.
	pendingFocus: RefObject<string | null>;
	// The room to leave above a row that the list scrolls to. It holds the
	// height of the header that stands at the top of the list, so a focused
	// row lands under that header and not behind it.
	scrollPaddingStart: number;
};

const heightOf = (item: TableItem, rowHeight: number, headerHeight: number) => {
	if (item.kind === "header") return headerHeight;
	if (item.kind === "agent") return agentLineHeight;
	if (item.kind === "pr") return prRowHeight;
	if (item.kind === "more") return showMoreHeight;
	return rowHeight;
};

// The virtual list of the table body. Every line but the agent line has a
// fixed height. An agent line wraps its words, so the virtualizer measures
// it once it renders and moves the lines below it. Every header line renders
// whatever the scroll offset is, because the header of a group stands at the
// top of the list while the rows of that group pass.
export function useTableVirtualizer({
	viewport,
	items,
	rowHeight,
	headerHeight,
	pendingFocus,
	scrollPaddingStart,
}: TableVirtualizerOptions) {
	const [initialRect, setInitialRect] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const { width, height } = viewport.current!.getBoundingClientRect();
		setInitialRect({ width, height });
	}, [viewport]);
	const headerIndexes = useMemo(() => items.flatMap((item, index) => (item.kind === "header" ? [index] : [])), [items]);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			[...new Set([...defaultRangeExtractor(range), ...headerIndexes])].sort((a, b) => a - b),
		[headerIndexes],
	);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => viewport.current,
		estimateSize: (index) => heightOf(items[index]!, rowHeight, headerHeight),
		enabled: initialRect.height > 0,
		initialRect,
		observeElementRect: (instance, callback) => {
			const element = instance.scrollElement!;
			let previous = { width: 0, height: 0 };
			const update = () => {
				const { width, height } = element.getBoundingClientRect();
				if (width === previous.width && height === previous.height) return;
				previous = { width, height };
				callback({ width, height });
			};
			update();
			instance.targetWindow!.addEventListener("resize", update);
			return () => instance.targetWindow!.removeEventListener("resize", update);
		},
		overscan: 8,
		rangeExtractor,
		scrollPaddingStart,
		getItemKey: (index) => items[index]!.key,
	});

	// A density or a width change resizes every line.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the line heights are the trigger; the virtualizer is stable
	useEffect(() => virtualizer.measure(), [rowHeight, headerHeight]);

	useEffect(() => {
		const id = pendingFocus.current;
		if (id === null) return;
		const index = items.findIndex((item) => item.kind === "row" && item.ticket.id === id);
		if (index === -1) {
			pendingFocus.current = null;
			return;
		}
		virtualizer.scrollToIndex(index, { align: "auto" });
		const element = viewport.current?.querySelector<HTMLElement>(
			`[role="row"][data-identifier="${(items[index] as { ticket: TicketSummary }).ticket.identifier}"]`,
		);
		if (element === null || element === undefined) return;
		element.focus({ preventScroll: true });
		pendingFocus.current = null;
	});

	return { virtualizer, headerIndexes };
}
