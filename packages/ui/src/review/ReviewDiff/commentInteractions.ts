import type { DiffAnchor } from "./ReviewDiff";

type DiffContext = { type: string; item: { type: string; fileDiff: { name: string } } };
type DiffLine = {
	type: string;
	annotationSide: "deletions" | "additions";
	lineNumber: number;
	numberColumn: boolean;
	lineType?: string;
	lineElement?: HTMLElement;
	numberElement?: HTMLElement;
	event?: PointerEvent;
};
type DiffRange = {
	start: number;
	end: number;
	side: "deletions" | "additions";
	endSide?: "deletions" | "additions";
};
type CommentOptions = {
	onLineClick: (line: DiffLine, context: DiffContext) => void;
	onLineSelectionEnd: (range: DiffRange | null, context: DiffContext) => void;
};

export function commentInteractions<Annotation = string>(
	onSelect: (anchor: DiffAnchor) => void,
): CommentOptions {
	return {
		onLineClick: (line, context) => {
			if (context.type !== "diff" || line.type !== "diff-line" || line.numberColumn) return;
			if (window.getSelection()?.type === "Range") return;
			onSelect({
				path: context.item.fileDiff.name,
				side: line.annotationSide === "deletions" ? "old" : "new",
				startLine: line.lineNumber,
				line: line.lineNumber,
			});
		},
		onLineSelectionEnd: (range, context) => {
			if (context.type !== "diff" || !range) return;
			if (range.endSide && range.side !== range.endSide) return;
			onSelect({
				path: context.item.fileDiff.name,
				side: range.side === "deletions" ? "old" : "new",
				startLine: Math.min(range.start, range.end),
				line: Math.max(range.start, range.end),
			});
		},
	};
}
