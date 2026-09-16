import { Plus } from "@phosphor-icons/react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import type { DiffAnchor } from "./ReviewDiff";
import type { DiffLine as Line } from "./reviewRows";

type SelectLine = (anchor: DiffAnchor, extend?: boolean) => void;

export function DiffLine({
	file,
	line,
	side,
	index,
	select,
	startPointer,
	endPointer,
}: {
	file: string;
	line?: Line;
	side: "old" | "new";
	index: string;
	select: SelectLine;
	startPointer: (anchor: DiffAnchor) => void;
	endPointer: (anchor: DiffAnchor) => void;
}) {
	if (!line) return <div className="review-diff-line review-diff-line-empty" />;
	const lineNumber = side === "old" ? line.oldLine : line.newLine;
	if (lineNumber === undefined) return <div className="review-diff-line review-diff-line-empty" />;
	const anchor = { path: file, side, startLine: lineNumber, line: lineNumber };
	return (
		<div
			className="review-diff-line"
			data-line-index={index}
			data-line-number={lineNumber}
			data-line-type={line.type === "context" ? "context" : `change-${line.type}`}
			data-side={side}
			onClick={(event) => {
				if (window.getSelection()?.type !== "Range") select(anchor, event.shiftKey);
			}}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				select(anchor, event.shiftKey);
			}}
			onPointerDown={() => startPointer(anchor)}
			onPointerUp={() => endPointer(anchor)}
			role="button"
			tabIndex={0}
		>
			<span className="review-diff-number">{lineNumber}</span>
			<code>{line.text || " "}</code>
			<Tooltip content="Add line comment">
				<IconButton
					label="Add line comment"
					icon={<Plus />}
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation();
						select(anchor);
					}}
				/>
			</Tooltip>
		</div>
	);
}
