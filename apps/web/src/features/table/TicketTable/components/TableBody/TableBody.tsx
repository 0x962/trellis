import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import {
	type MouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Density } from "../../../../../stores/uiStore";
import type { ColumnId } from "../../../columns";
import { GroupHeader, groupHeaderHeight } from "../../../GroupHeader";
import type { RowSelection } from "../../../hooks/useRowSelection";
import { type EditField, Row, type RowChange, rowHeights } from "../../../Row";
import type { TableItem } from "../../../utils/flattenGroups";
import { ShowMoreRow, showMoreHeight } from "../ShowMoreRow";
import { TableSkeleton } from "../TableSkeleton";

export type TableBodyProps = {
	items: readonly TableItem[];
	columns: readonly ColumnId[];
	density: Density;
	project?: string;
	statuses: readonly StatusSummary[];
	projects: readonly ProjectSummary[];
	loading: boolean;
	// The ticket rows of the list, for `aria-rowcount`.
	rowCount: number;
	focusedId: string | null;
	// The id of a row a key moved the focus to. The body scrolls it into
	// view and focuses it once it mounts.
	pendingFocus: RefObject<string | null>;
	selection: RowSelection;
	editing: { id: string; field: EditField } | null;
	onFocusRow: (id: string) => void;
	onRowClick: (id: string, event: MouseEvent) => void;
	onOpen: (id: string) => void;
	onEditingChange: (id: string, field: EditField | null) => void;
	onRowChange: (ticket: TicketSummary, change: RowChange) => void;
	onToggleGroup: (key: string) => void;
	onCreateInGroup: (status: StatusSummary) => void;
};

const heightOf = (item: TableItem, density: Density) =>
	item.kind === "header" ? groupHeaderHeight : item.kind === "more" ? showMoreHeight : rowHeights[density];

// The scroll container and the virtual list inside it. Every line has a
// fixed height, so the spacer is the sum of the lines and never moves
// when data arrives.
export function TableBody({
	items,
	columns,
	density,
	project,
	statuses,
	projects,
	loading,
	rowCount,
	focusedId,
	pendingFocus,
	selection,
	editing,
	onFocusRow,
	onRowClick,
	onOpen,
	onEditingChange,
	onRowChange,
	onToggleGroup,
	onCreateInGroup,
}: TableBodyProps) {
	const viewport = useRef<HTMLDivElement>(null);
	const [initialRect, setInitialRect] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const { width, height } = viewport.current!.getBoundingClientRect();
		setInitialRect({ width, height });
	}, []);
	const headerIndexes = useMemo(() => items.flatMap((item, index) => (item.kind === "header" ? [index] : [])), [items]);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			[...new Set([...defaultRangeExtractor(range), ...headerIndexes])].sort((a, b) => a - b),
		[headerIndexes],
	);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => viewport.current,
		estimateSize: (index) => heightOf(items[index]!, density),
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
		getItemKey: (index) => items[index]!.key,
	});

	// A density change resizes every line.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the density is the trigger; the virtualizer is stable
	useEffect(() => virtualizer.measure(), [density]);

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

	return (
		// biome-ignore lint/a11y/useSemanticElements: the grid is virtualized, so its rows are absolutely positioned divs.
		<div
			ref={viewport}
			role="grid"
			aria-rowcount={rowCount}
			aria-multiselectable="true"
			aria-busy={loading || undefined}
			data-table-viewport=""
			data-selecting={selection.count > 0 ? "" : undefined}
			tabIndex={-1}
			className="min-h-0 flex-1 overflow-auto outline-none [scrollbar-gutter:stable]"
		>
			{loading ? (
				<TableSkeleton density={density} />
			) : (
				<div data-table-body="" style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
					{virtualizer.getVirtualItems().map((virtual) => {
						const item = items[virtual.index]!;
						if (item.kind === "header") {
							const { group } = item;
							return (
								<GroupHeader
									key={virtual.key}
									group={group.key}
									label={group.label ?? ""}
									count={group.count}
									status={group.status}
									category={group.category}
									expanded={group.expanded}
									onToggle={() => onToggleGroup(group.key)}
									onCreate={group.status === undefined ? undefined : () => onCreateInGroup(group.status!)}
									top={virtual.start}
								/>
							);
						}
						if (item.kind === "more") {
							return (
								<ShowMoreRow
									key={virtual.key}
									label={item.group.label ?? ""}
									loading={item.group.loading ?? false}
									onLoadMore={() => item.group.loadMore?.()}
									top={virtual.start}
								/>
							);
						}
						const { ticket } = item;
						return (
							<Row
								key={virtual.key}
								ticket={ticket}
								density={density}
								columns={columns as string[]}
								viewedProject={project}
								top={virtual.start}
								group={item.group.key}
								focused={ticket.id === focusedId}
								selected={selection.isSelected(ticket.id)}
								selecting={selection.count > 0}
								editing={editing?.id === ticket.id ? editing.field : null}
								statuses={statuses}
								projects={projects}
								onFocus={(id) => {
									if (pendingFocus.current === null) onFocusRow(id);
								}}
								onClick={onRowClick}
								onOpen={onOpen}
								onToggleSelect={selection.toggle}
								onEditingChange={onEditingChange}
								onChange={onRowChange}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
