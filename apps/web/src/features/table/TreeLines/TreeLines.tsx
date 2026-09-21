import { cx } from "@trellis/ui";

// The tree lines tie the child lines of a ticket (its pull request rows and
// its agent line) to the ticket row above them. Each piece is a 1 px line
// in the `border` color, absolutely placed inside its line of the table.
//
// All the pieces sit at `left-[58px]`, the center of the status icon of a
// ticket row at 768 px and up: 20 px of row padding, the 16 px select
// column, the 12 px column gap, and 4 px of padding in the status button
// put the 14 px icon at 52 px.

// The top of the tree rule, on a ticket row whose child lines follow it.
// It runs from under the status icon to the bottom edge of the row.
export function TreeStem() {
	return <span aria-hidden="true" className="absolute top-[calc(50%+9px)] bottom-0 left-[58px] w-px bg-border" />;
}

type TreeBranchProps = {
	// True on the final child line of the ticket. The rule then stops at the
	// elbow and makes a corner.
	last: boolean;
	// The distance from the top of the line to the elbow, in px. The elbow
	// points at the middle of the first line of text.
	elbowTop: number;
};

// The rule and the elbow of one child line. The rule runs the full height
// of the line, so a tall line stays tied to its ticket. The elbow ends 6 px
// before `pl-19`, where every child line starts its content.
export function TreeBranch({ last, elbowTop }: TreeBranchProps) {
	return (
		<>
			<span
				aria-hidden="true"
				style={last ? { height: `${elbowTop}px` } : undefined}
				className={cx("absolute top-0 left-[58px] w-px bg-border", !last && "bottom-0")}
			/>
			<span aria-hidden="true" style={{ top: `${elbowTop}px` }} className="absolute left-[58px] h-px w-3 bg-border" />
		</>
	);
}
