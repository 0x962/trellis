import { GroupHeader } from "@trellis/ui";
import type { ReactNode } from "react";
import { formatCount } from "../../../../../lib/format";
import { useResultVirtualizer } from "./useResultVirtualizer";

export type ResultGroupProps<T> = {
	label: string;
	count?: number;
	items: readonly T[];
	rowHeight: number;
	children: (item: T) => ReactNode;
	layout?: "table" | "list";
};

export function ResultGroup<T extends { id: string }>({
	label,
	count,
	items,
	rowHeight,
	children,
	layout = "table",
}: ResultGroupProps<T>) {
	const { list, virtualizer, setFocusedId } = useResultVirtualizer(items, rowHeight);
	return (
		<section aria-label={label}>
			<GroupHeader
				group={label.toLowerCase()}
				label={label}
				count={count === undefined ? undefined : formatCount(count)}
				collapsible={false}
				appearance="band"
			/>
			<ul
				ref={list}
				aria-label={`${label} search results`}
				className="relative"
				style={{ height: virtualizer.getTotalSize() }}
				onBlurCapture={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(undefined);
				}}
			>
				{virtualizer.getVirtualItems().map((row) => (
					<li
						key={row.key}
						ref={virtualizer.measureElement}
						data-index={row.index}
						aria-posinset={row.index + 1}
						aria-setsize={items.length}
						onFocusCapture={() => setFocusedId(items[row.index]!.id)}
						className="absolute inset-x-0 top-0"
						style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
					>
						{layout === "list" ? (
							<ul role="presentation">{children(items[row.index]!)}</ul>
						) : (
							<table role="presentation" className="w-full table-fixed border-collapse">
								<tbody>{children(items[row.index]!)}</tbody>
							</table>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
