import { Plus } from "@phosphor-icons/react";
import { createElement, type ReactNode, useEffect, useMemo, useRef } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { lineAnnotations } from "./lineAnnotations";
import { parseReviewFiles, type ReviewFile, type ReviewHunk } from "./parseReviewFiles";

export type DiffAnchor = { path: string; side: "old" | "new"; line: number; startLine: number };
export type DiffThread = DiffAnchor & { id: string; version: number; updatedAt: string; revisionId: string | null };

type Props = {
	patch: string;
	revisionId: string;
	threads: DiffThread[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	filter?: string;
	renderThread: (id: string) => ReactNode;
	composer?: DiffAnchor | null;
	renderComposer?: () => ReactNode;
	onSelect: (anchor: DiffAnchor) => void;
	loadFile?: (path: string, side: "old" | "new") => Promise<string>;
	onFiles: (files: { path: string; type: string; additions: number; deletions: number }[]) => void;
};

type Line = {
	type: "context" | "addition" | "deletion";
	text: string;
	oldLine?: number;
	newLine?: number;
};

const text = (value: string) => value.replace(/\r?\n$/, "");

const hunkLines = (file: ReviewFile, hunk: ReviewHunk): Line[] =>
	hunk.hunkContent.flatMap<Line>((content): Line[] => {
		if (content.type === "context")
			return Array.from({ length: content.lines }, (_, index) => ({
				type: "context" as const,
				text: text(file.additionLines[content.additionLineIndex + index] ?? ""),
				oldLine: hunk.deletionStart + content.deletionLineIndex + index - hunk.deletionLineIndex,
				newLine: hunk.additionStart + content.additionLineIndex + index - hunk.additionLineIndex,
			}));
		return [
			...Array.from({ length: content.deletions }, (_, index) => ({
				type: "deletion" as const,
				text: text(file.deletionLines[content.deletionLineIndex + index] ?? ""),
				oldLine: hunk.deletionStart + content.deletionLineIndex + index - hunk.deletionLineIndex,
			})),
			...Array.from({ length: content.additions }, (_, index) => ({
				type: "addition" as const,
				text: text(file.additionLines[content.additionLineIndex + index] ?? ""),
				newLine: hunk.additionStart + content.additionLineIndex + index - hunk.additionLineIndex,
			})),
		];
	});

const splitLines = (lines: Line[]): [Line | undefined, Line | undefined][] => {
	const rows: [Line | undefined, Line | undefined][] = [];
	for (let index = 0; index < lines.length; ) {
		const line = lines[index]!;
		if (line.type === "context") {
			rows.push([line, line]);
			index += 1;
			continue;
		}
		const deletions: Line[] = [];
		const additions: Line[] = [];
		while (lines[index]?.type === "deletion") deletions.push(lines[index++]!);
		while (lines[index]?.type === "addition") additions.push(lines[index++]!);
		const count = Math.max(deletions.length, additions.length);
		for (let row = 0; row < count; row++) rows.push([deletions[row], additions[row]]);
	}
	return rows;
};

function DiffsContainer({ mode, children }: { mode: "split" | "unified"; children: ReactNode }) {
	return createElement("diffs-container", { className: "review-code", "data-diff-type": mode }, children);
}

function DiffLine({
	file,
	line,
	side,
	index,
	onSelect,
}: {
	file: string;
	line?: Line;
	side: "old" | "new";
	index: string;
	onSelect: (anchor: DiffAnchor) => void;
}) {
	if (!line) return <div className="review-diff-line review-diff-line-empty" />;
	const lineNumber = side === "old" ? line.oldLine : line.newLine;
	if (lineNumber === undefined) return <div className="review-diff-line review-diff-line-empty" />;
	const select = () => onSelect({ path: file, side, startLine: lineNumber, line: lineNumber });
	return (
		<div
			className="review-diff-line"
			data-line-index={index}
			data-line-type={line.type === "context" ? "context" : `change-${line.type}`}
			data-side={side}
			onClick={() => {
				if (window.getSelection()?.type !== "Range") select();
			}}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				select();
			}}
			role="button"
			tabIndex={0}
		>
			<span className="review-diff-number">{lineNumber}</span>
			<code>{line.text || " "}</code>
			<Tooltip content="Add line comment">
				<IconButton
					label="Add line comment"
					icon={<Plus />}
					onClick={(event) => {
						event.stopPropagation();
						select();
					}}
				/>
			</Tooltip>
		</div>
	);
}

export function ReviewDiff({
	patch,
	revisionId,
	threads,
	mode,
	selectedFile,
	filter = "",
	renderThread,
	composer = null,
	renderComposer,
	onSelect,
	onFiles,
}: Props) {
	const files = useMemo(() => parseReviewFiles(patch), [patch]);
	const fileElements = useRef(new Map<string, HTMLElement>());
	useEffect(() => {
		onFiles(
			files.map((file) => ({
				path: file.name,
				type: file.type,
				additions: file.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
				deletions: file.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
			})),
		);
	}, [files, onFiles]);
	useEffect(() => {
		if (selectedFile) fileElements.current.get(selectedFile)?.scrollIntoView({ block: "start" });
	}, [selectedFile]);
	const shown = files.filter((file) => file.name.toLowerCase().includes(filter.toLowerCase()));
	if (shown.length === 0)
		return (
			<div className="review-diff-empty">
				<EmptyState
					title={filter ? "No matching files" : "No changes"}
					description={
						filter ? "Clear the file filter to show all changes." : "This revision has no text changes to display."
					}
				/>
			</div>
		);
	return (
		<DiffsContainer mode={mode}>
			{shown.map((file) => {
				const annotations = lineAnnotations(file, threads, revisionId, composer);
				const annotation = (side: "old" | "new", line: number) =>
					annotations
						.filter((item) => item.side === (side === "old" ? "deletions" : "additions") && item.lineNumber === line)
						.map((item) => (
							<div className="review-diff-annotation" key={`${item.side}-${item.lineNumber}-${item.metadata}`}>
								{item.metadata === "composer" ? renderComposer?.() : renderThread(item.metadata)}
							</div>
						));
				return (
					<section
						className="review-diff-file"
						data-file-path={file.name}
						key={file.name}
						ref={(element) => {
							if (element) fileElements.current.set(file.name, element);
							else fileElements.current.delete(file.name);
						}}
					>
						<header>{file.prevName ? `${file.prevName} → ${file.name}` : file.name}</header>
						{annotations
							.filter((item) => item.lineNumber === 0)
							.map((item) => (
								<div className="review-diff-annotation" key={`${item.side}-${item.metadata}`}>
									{item.metadata === "composer" ? renderComposer?.() : renderThread(item.metadata)}
								</div>
							))}
						{file.hunks.map((hunk, hunkIndex) => {
							const lines = hunkLines(file, hunk);
							return (
								<div className="review-diff-hunk" key={`${hunk.deletionStart}-${hunk.additionStart}`}>
									<div className="review-diff-hunk-header">{hunk.hunkSpecs}</div>
									{mode === "split"
										? splitLines(lines).map(([oldLine, newLine], lineIndex) => (
											<div className="review-diff-split-row" key={`${hunkIndex}-${lineIndex}`}>
												<div>
													<DiffLine
														file={file.name}
														line={oldLine}
														side="old"
														index={`${hunkIndex}-${lineIndex}-old`}
														onSelect={onSelect}
													/>
													{oldLine?.oldLine ? annotation("old", oldLine.oldLine) : null}
												</div>
												<div>
													<DiffLine
														file={file.name}
														line={newLine}
														side="new"
														index={`${hunkIndex}-${lineIndex}-new`}
														onSelect={onSelect}
													/>
													{newLine?.newLine ? annotation("new", newLine.newLine) : null}
												</div>
											</div>
										))
										: lines.map((line, lineIndex) => {
												const side = line.type === "deletion" ? "old" : "new";
												const lineNumber = side === "old" ? line.oldLine : line.newLine;
												return (
													<div key={`${hunkIndex}-${lineIndex}`}>
														<DiffLine
															file={file.name}
															line={line}
															side={side}
															index={`${hunkIndex}-${lineIndex}`}
															onSelect={onSelect}
														/>
														{lineNumber ? annotation(side, lineNumber) : null}
													</div>
												);
											})}
								</div>
							);
						})}
					</section>
				);
			})}
		</DiffsContainer>
	);
}
