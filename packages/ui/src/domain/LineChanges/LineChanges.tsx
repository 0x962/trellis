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
// color marks a real change. While the counts are on their way, each side
// shows an ellipsis. When the counts are not known and none is coming, the
// component draws nothing and keeps the reserved width, so a row with counts
// and a row without them line up.
export function LineChanges({ value, pending, align = "end" }: LineChangesProps) {
	const shape = cx("inline-flex shrink-0 items-center gap-1 tabular", align === "end" && "min-w-16 justify-end");
	if (value === null && !pending) return <span aria-hidden="true" className={shape} />;
	const label =
		value === null
			? "Line changes not ready"
			: `${value.additions} ${value.additions === 1 ? "line" : "lines"} added, ${value.deletions} ${value.deletions === 1 ? "line" : "lines"} deleted`;
	const side = (sign: string, count: number | undefined, tone: string) => (
		<span aria-hidden="true" className={count === undefined || count === 0 ? "text-fg-faint" : tone}>
			{sign}
			{count === undefined ? "…" : digits.format(count)}
		</span>
	);
	return (
		<span className={shape}>
			<span className="sr-only">{label}</span>
			{side("+", value?.additions, "text-success")}
			{side("−", value?.deletions, "text-danger")}
		</span>
	);
}
