// The box that `LabelPill` and the "N labels" pill of `LabelPills` share: 20 px
// high with round ends, and at most 176 px wide. `min-w-0` lets the pill
// narrow inside a tight row, and then the name inside it cuts off with an
// ellipsis.
export const labelPillFrame =
	"inline-flex h-5 max-w-44 min-w-0 items-center gap-1.5 rounded-round border border-border bg-surface pr-2 pl-1.5 text-xs whitespace-nowrap text-fg tabular";
