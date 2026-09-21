import { cx } from "@trellis/ui";

// The tree lines tie the child lines of a ticket (its pull request rows and
// its agent line) to the line above them. Each piece is a 1 px line in the
// `border` color, absolutely placed inside its line of the table.
//
// A level 1 piece sits at `left-[58px]`, the center of the status icon of a
// ticket row at 768 px and up: 20 px of row padding, the 16 px select
// column, the 12 px column gap, and 4 px of padding in the status button
// put the 14 px icon at 52 px.
//
// A level 2 piece sits at `left-[84px]`, the center of the pull request
// glyph: a child line starts its content at 76 px, and the glyph is 16 px
// wide. The agent line under a pull request is the only level 2 line.
export type TreeDepth = 1 | 2;

const ruleLeft: Record<TreeDepth, string> = { 1: "left-[58px]", 2: "left-[84px]" };

// Where a child line of each level starts its content: 6 px after the elbow
// of that level ends.
export const treeContentPad: Record<TreeDepth, string> = { 1: "pl-19", 2: "pl-[102px]" };

type TreeStemProps = {
	// The level of the rule that runs down from this line to its own child
	// lines. Level 1 hangs the pull request lines and the agent line under a
	// ticket row. Level 2 hangs the agent line under a pull request line.
	depth: TreeDepth;
};

// The top of the tree rule, on a line whose child lines follow it. It runs
// from under the icon of the line to its bottom edge.
export function TreeStem({ depth }: TreeStemProps) {
	return (
		<span aria-hidden="true" className={cx("absolute top-[calc(50%+9px)] bottom-0 w-px bg-border", ruleLeft[depth])} />
	);
}

type TreeBranchProps = {
	// True on the final child line of the parent. The rule then stops at the
	// elbow and makes a corner.
	last: boolean;
	// The distance from the top of the line to the elbow, in px. The elbow
	// points at the middle of the first line of text.
	elbowTop: number;
	// The level of the parent this line hangs from.
	depth: TreeDepth;
};

// The rule and the elbow of one child line. The rule runs the full height
// of the line, so a tall line stays tied to the line it hangs from. The
// elbow ends 6 px before the content of the child line starts.
export function TreeBranch({ last, elbowTop, depth }: TreeBranchProps) {
	return (
		<>
			<span
				aria-hidden="true"
				style={last ? { height: `${elbowTop}px` } : undefined}
				className={cx("absolute top-0 w-px bg-border", ruleLeft[depth], !last && "bottom-0")}
			/>
			<span
				aria-hidden="true"
				style={{ top: `${elbowTop}px` }}
				className={cx("absolute h-px w-3 bg-border", ruleLeft[depth])}
			/>
		</>
	);
}
