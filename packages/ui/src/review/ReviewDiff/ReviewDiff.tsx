import { ArrowsInLineVertical, ArrowsOutLineVertical } from "@phosphor-icons/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { DiffLine } from "./DiffLine";
import { loadReviewFileContents } from "./loadReviewFileContents";
import { parseReviewFiles, type ReviewFile } from "./parseReviewFiles";
import {
	buildReviewRows,
	type ExpandedFile,
	type ReviewRow,
} from "./reviewRows";
import { VirtualDiffRows } from "./VirtualDiffRows";
import "./ReviewDiff.css";

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

type SelectLine = (anchor: DiffAnchor, extend?: boolean) => void;

const orderedAnchor = (start: DiffAnchor, end: DiffAnchor): DiffAnchor => ({
	path: start.path,
	side: start.side,
	startLine: Math.min(start.line, end.line),
	line: Math.max(start.line, end.line),
});

const fileLabel = (file: ReviewFile) => (file.prevName ? `${file.prevName} → ${file.name}` : file.name);

export function ReviewDiff({
	patch,
	revisionId,
	threads,
	mode,
	theme,
	selectedFile,
	filter = "",
	renderThread,
	composer = null,
	renderComposer,
	onSelect,
	onFiles,
	loadFile,
}: Props) {
	const files = useMemo(() => parseReviewFiles(patch), [patch]);
	const metadata = useMemo(
		() =>
			files.map((file) => ({
				path: file.name,
				type: file.type,
				additions: file.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
				deletions: file.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
			})),
		[files],
	);
	useEffect(() => onFiles(metadata), [metadata, onFiles]);
	const shown = useMemo(() => {
		const query = filter.toLowerCase();
		return files.filter((file) => file.name.toLowerCase().includes(query));
	}, [files, filter]);
	const [expanded, setExpanded] = useState<ReadonlyMap<string, ExpandedFile>>(() => new Map());
	const rows = useMemo(
		() => buildReviewRows(shown, mode, threads, revisionId, composer, expanded),
		[shown, mode, threads, revisionId, composer, expanded],
	);
	const selection = useRef<DiffAnchor | undefined>(undefined);
	const pointer = useRef<DiffAnchor | undefined>(undefined);
	const skipClick = useRef(false);
	const select = useCallback<SelectLine>(
		(anchor, extend = false) => {
			const start = selection.current;
			if (extend && start?.path === anchor.path && start.side === anchor.side) onSelect(orderedAnchor(start, anchor));
			else {
				selection.current = anchor;
				onSelect(anchor);
			}
		},
		[onSelect],
	);
	const startPointer = (anchor: DiffAnchor) => {
		pointer.current = anchor;
	};
	const endPointer = (anchor: DiffAnchor) => {
		const start = pointer.current;
		pointer.current = undefined;
		if (!start || start.path !== anchor.path || start.side !== anchor.side || start.line === anchor.line) return;
		selection.current = start;
		skipClick.current = true;
		onSelect(orderedAnchor(start, anchor));
	};
	const clickSelect = useCallback<SelectLine>(
		(anchor, extend) => {
			if (skipClick.current) {
				skipClick.current = false;
				return;
			}
			select(anchor, extend);
		},
		[select],
	);
	const toggleFile = async (file: ReviewFile) => {
		if (expanded.has(file.name)) {
			setExpanded((current) => {
				const next = new Map(current);
				next.delete(file.name);
				return next;
			});
			return;
		}
		const contents = await loadReviewFileContents(loadFile!, file);
		setExpanded((current) => new Map(current).set(file.name, contents));
	};
	const annotation = (metadata: string) => (
		<div className="review-diff-annotation" key={metadata}>
			{metadata === "composer" ? renderComposer?.() : renderThread(metadata)}
		</div>
	);
	const renderRow = (row: ReviewRow) => {
		if (row.kind === "file") {
			const isExpanded = expanded.has(row.file.name);
			return (
				<header className="review-diff-file-header" data-file-path={row.file.name}>
					<span>{fileLabel(row.file)}</span>
					{loadFile && row.file.hunks.length > 0 ? (
						<Tooltip content={isExpanded ? "Show patch only" : "Show full file"}>
							<IconButton
								label={isExpanded ? "Show patch only" : "Show full file"}
								icon={isExpanded ? <ArrowsInLineVertical /> : <ArrowsOutLineVertical />}
								onClick={() => void toggleFile(row.file)}
							/>
						</Tooltip>
					) : null}
				</header>
			);
		}
		if (row.kind === "hunk") return <div className="review-diff-hunk-header">{row.specs}</div>;
		if (row.kind === "annotation") return <>{row.annotations.map(annotation)}</>;
		if (row.kind === "end") return <div className="review-diff-file-end" />;
		if (row.kind === "split")
			return (
				<div className="review-diff-split-row">
					<div>
						<DiffLine
							file={row.file.name}
							line={row.oldLine}
							side="old"
							index={`${row.key}:old`}
							select={clickSelect}
							startPointer={startPointer}
							endPointer={endPointer}
						/>
						{row.oldAnnotations.map(annotation)}
					</div>
					<div>
						<DiffLine
							file={row.file.name}
							line={row.newLine}
							side="new"
							index={`${row.key}:new`}
							select={clickSelect}
							startPointer={startPointer}
							endPointer={endPointer}
						/>
						{row.newAnnotations.map(annotation)}
					</div>
				</div>
			);
		return (
			<div>
				<DiffLine
					file={row.file.name}
					line={row.line}
					side={row.line.type === "deletion" ? "old" : "new"}
					index={row.key}
					select={clickSelect}
					startPointer={startPointer}
					endPointer={endPointer}
				/>
				{row.annotations.map(annotation)}
			</div>
		);
	};
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
	return <VirtualDiffRows rows={rows} mode={mode} theme={theme} selectedFile={selectedFile} renderRow={renderRow} />;
}
