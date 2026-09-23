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

// The added and deleted line counts of a workspace. A count of zero is faint,
// so the color marks a real change only. A null value with pending true means
// the counts still load, and each side shows an ellipsis. A null value with
// pending false means no count will arrive: the component draws nothing, but
// it keeps the 64 px width, so a row with counts and a row without them stay
// the same width.
export function LineChanges({ value, pending, align = "end" }: LineChangesProps) {
	const boxClass = cx("inline-flex shrink-0 items-center gap-1 tabular", align === "end" && "min-w-16 justify-end");
	if (value === null && !pending) return <span aria-hidden="true" className={boxClass} />;
	const label =
		value === null || pending
			? "Line changes not ready"
			: `${value.additions} ${value.additions === 1 ? "line" : "lines"} added, ${value.deletions} ${value.deletions === 1 ? "line" : "lines"} deleted`;
	const side = (sign: string, count: number | undefined, tone: string) => (
		<span aria-hidden="true" className={count === undefined || count === 0 ? "text-fg-faint" : tone}>
			{sign}
			{count === undefined ? "…" : digits.format(count)}
		</span>
	);
	return (
		<span className={boxClass}>
			<span className="sr-only">{label}</span>
			{side("+", value?.additions, "text-success")}
			{side("−", value?.deletions, "text-danger")}
		</span>
	);
}
