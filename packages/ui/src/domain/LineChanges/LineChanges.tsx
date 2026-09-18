import { cx } from "../../utils/cx";

export type LineChangesValue = { additions: number; deletions: number };

export type LineChangesProps = {
	value: LineChangesValue | null;
	pending: boolean;
	// "end" reserves 64 px and sets the counts against the right edge, so a
	// column of cards or rows keeps its shape while the counts load. "start"
	// takes the width of its text, for counts that follow other text.
	align?: "start" | "end";
};

const digits = new Intl.NumberFormat();

// The added and deleted line counts of a workspace: green plus, red minus,
// tabular digits grouped by thousands. A count of zero is faint, so the
// color marks a real change. A pending count shows an ellipsis, and a
// missing count shows a dash.
export function LineChanges({ value, pending, align = "end" }: LineChangesProps) {
	const label = pending
		? "Line changes not ready"
		: value === null
			? "Line changes unavailable"
			: `${value.additions} ${value.additions === 1 ? "line" : "lines"} added, ${value.deletions} ${value.deletions === 1 ? "line" : "lines"} deleted`;
	const side = (sign: string, count: number | undefined, tone: string) => (
		<span aria-hidden="true" className={count === undefined || count === 0 ? "text-fg-faint" : tone}>
			{sign}
			{count === undefined ? (pending ? "…" : "–") : digits.format(count)}
		</span>
	);
	return (
		<span className={cx("inline-flex shrink-0 items-center gap-1 tabular", align === "end" && "min-w-16 justify-end")}>
			<span className="sr-only">{label}</span>
			{side("+", value?.additions, "text-success")}
			{side("−", value?.deletions, "text-danger")}
		</span>
	);
}
