import { cx } from "@trellis/ui";
import { type ColumnId, columnLabels, gridColumnsClass, gridStyle, narrowHidden } from "../../../columns";

export type ColumnHeaderRowProps = {
	columns: readonly ColumnId[];
};

// The columns the select mark and the priority mark head with no text.
const unlabeled: readonly ColumnId[] = ["select", "priority", "actor"];

// Under 768 px the status cell shows its icon alone in a 28 px track, so
// its heading is for assistive tech only.
const narrowUnlabeled: readonly ColumnId[] = ["status"];

// The column headings above the scroller. The gutter matches the
// scroller's, so the headings sit over their cells.
export function ColumnHeaderRow({ columns }: ColumnHeaderRowProps) {
	return (
		<div
			role="presentation"
			style={gridStyle(columns)}
			className={cx(
				"grid h-8 shrink-0 items-center gap-3 border-b border-border px-5 text-xs font-medium text-fg-faint [scrollbar-gutter:stable] max-md:gap-2 max-md:px-4",
				gridColumnsClass,
			)}
		>
			{columns.map((column) => (
				// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The table rows own focus, so the column headings stay outside the tab order.
				<div
					key={column}
					role="columnheader"
					data-column={column}
					className={cx("truncate", narrowHidden.includes(column) && "max-md:hidden")}
				>
					<span
						className={cx(
							unlabeled.includes(column) && "sr-only",
							narrowUnlabeled.includes(column) && "max-md:sr-only",
						)}
					>
						{columnLabels[column]}
					</span>
				</div>
			))}
		</div>
	);
}
