import type { CodeViewReactOptions } from "@pierre/diffs/react";
import type { DiffAnchor } from "./ReviewDiff";

export function commentInteractions<Annotation = string>(
	onSelect: (anchor: DiffAnchor) => void,
): CodeViewReactOptions<Annotation, undefined> {
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
