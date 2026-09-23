import { ArrowLineDown, ArrowLineUp, ArrowsInLineVertical, ArrowsOutLineVertical } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "../../primitives/Checkbox";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { DiffLine } from "./DiffLine";
import { loadReviewFileContents } from "./loadReviewFileContents";
import { parseReviewFiles, type ReviewFile } from "./parseReviewFiles";
import {
	anchorLines,
	buildReviewRows,
	EXPAND_LINES,
	type ExpandedFile,
	type GapControls,
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
	selectedAnchor?: DiffAnchor | null;
	filter?: string;
	renderThread: (id: string) => ReactNode;
	composer?: DiffAnchor | null;
	renderComposer?: () => ReactNode;
	// `lines` is the text of the selected lines, for a suggestion, or null
	// when the view does not show every line of the range.
	onSelect: (anchor: DiffAnchor, lines: string[] | null) => void;
	loadFile?: (path: string, side: "old" | "new") => Promise<string>;
	onFiles: (files: ReviewDiffFile[]) => void;
	// The paths in the order the diff draws them, from the risk groups of the
	// file tree. A path the list leaves out keeps its place in the patch, after
	// every path the list names. An empty list keeps the patch order.
	order?: readonly string[];
	// The paths the person marked read. A read file shows its header alone.
	viewed?: ReadonlySet<string>;
	// Marks a file read or unread. The header draws the Viewed box only when
	// the caller keeps this state.
	onViewed?: (path: string, viewed: boolean) => void;
};

// What `onFiles` reports about one changed file of the revision.
export type ReviewDiffFile = {
	path: string;
	type: string;
	additions: number;
	deletions: number;
	binary: boolean;
	// The hash of the patch text of the file. The review page keys the read
	// mark on it.
	digest: string;
};

type SelectLine = (anchor: DiffAnchor, extend?: boolean) => void;

const noOrder: readonly string[] = [];

const orderedAnchor = (start: DiffAnchor, end: DiffAnchor): DiffAnchor => ({
	path: start.path,
	side: start.side,
	startLine: Math.min(start.line, end.line),
	line: Math.max(start.line, end.line),
});

const fileLabel = (file: ReviewFile) => (file.prevName ? `${file.prevName} → ${file.name}` : file.name);

// The words of a row that sits between two hunks: the hunk specs of the
// patch, and how many lines the gap above the hunk still hides. The row
// after the last hunk has no specs, and it has no count until the file
// contents load.
const hunkLabel = (specs: string | null, gap: GapControls | null) => {
	const hidden = gap?.hidden ?? null;
	const count = hidden === null ? null : `${hidden} hidden ${hidden === 1 ? "line" : "lines"}`;
	return [specs, count].filter((part) => part !== null).join(" · ");
};

const nothingViewed: ReadonlySet<string> = new Set();

export function ReviewDiff({
	patch,
	revisionId,
	threads,
	mode,
	theme,
	selectedFile,
	selectedAnchor = null,
	filter = "",
	renderThread,
	composer = null,
	renderComposer,
	onSelect,
	onFiles,
	loadFile,
	order = noOrder,
	viewed = nothingViewed,
	onViewed,
}: Props) {
	const files = useMemo(() => parseReviewFiles(patch), [patch]);
	const metadata = useMemo(
		() =>
			files.map((file) => ({
				path: file.name,
				type: file.type,
				additions: file.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
				deletions: file.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
				binary: file.binary,
				digest: file.digest,
			})),
		[files],
	);
	useEffect(() => onFiles(metadata), [metadata, onFiles]);
	const shown = useMemo(() => {
		const query = filter.toLowerCase();
		const rank = new Map(order.map((path, index) => [path, index]));
		return files
			.filter((file) => file.name.toLowerCase().includes(query))
			.map((file, index) => ({ file, rank: rank.get(file.name) ?? order.length + index }))
			.sort((left, right) => left.rank - right.rank)
			.map((entry) => entry.file);
	}, [files, filter, order]);
	const [expanded, setExpanded] = useState<ReadonlyMap<string, ExpandedFile>>(() => new Map());
	const rows = useMemo(
		() => buildReviewRows(shown, mode, threads, revisionId, composer, expanded, loadFile !== undefined, viewed),
		[shown, mode, threads, revisionId, composer, expanded, loadFile, viewed],
	);
	const selection = useRef<DiffAnchor | undefined>(undefined);
	const pointer = useRef<DiffAnchor | undefined>(undefined);
	const skipClick = useRef(false);
	const selectAnchor = useCallback(
		(anchor: DiffAnchor) => onSelect(anchor, anchorLines(files, expanded, anchor)),
		[onSelect, files, expanded],
	);
	const select = useCallback<SelectLine>(
		(anchor, extend = false) => {
			const start = selection.current;
			if (extend && start?.path === anchor.path && start.side === anchor.side)
				selectAnchor(orderedAnchor(start, anchor));
			else {
				selection.current = anchor;
				selectAnchor(anchor);
			}
		},
		[selectAnchor],
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
		selectAnchor(orderedAnchor(start, anchor));
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
	// The lines of both sides of the file. The diff reads them with the
	// first press and keeps them for every later press.
	const fileContents = async (file: ReviewFile): Promise<ExpandedFile> =>
		expanded.get(file.name) ?? { ...(await loadReviewFileContents(loadFile!, file)), full: false, gaps: new Map() };
	// A press changes the file that the state holds while the read runs, so
	// each press takes the state at the moment it writes.
	const writeFile = (name: string, loaded: ExpandedFile, change: (contents: ExpandedFile) => ExpandedFile) =>
		setExpanded((current) => new Map(current).set(name, change(current.get(name) ?? loaded)));
	// The toggle of the file header. It opens every gap of the file, and a
	// second press shuts them all.
	const toggleFile = async (file: ReviewFile) => {
		const loaded = await fileContents(file);
		writeFile(file.name, loaded, (contents) => ({ ...contents, full: !contents.full, gaps: new Map() }));
	};
	// One press of an expand control. "down" opens the lines under the hunk
	// above the gap, "up" opens the lines above the hunk under the gap, and
	// "all" opens every line the gap still hides.
	const expandGap = async (file: ReviewFile, gap: GapControls, direction: "down" | "up" | "all") => {
		const loaded = await fileContents(file);
		writeFile(file.name, loaded, (contents) => {
			const reveal = contents.gaps.get(gap.index) ?? { top: 0, bottom: 0 };
			const next =
				direction === "down"
					? { ...reveal, top: reveal.top + EXPAND_LINES }
					: direction === "up"
						? { ...reveal, bottom: reveal.bottom + EXPAND_LINES }
						: { ...reveal, top: reveal.top + (gap.hidden ?? 0) };
			return { ...contents, gaps: new Map(contents.gaps).set(gap.index, next) };
		});
	};
	const annotation = (metadata: string) => (
		<div className="review-diff-annotation" key={metadata}>
			{metadata === "composer" ? renderComposer?.() : renderThread(metadata)}
		</div>
	);
	const renderRow = (row: ReviewRow) => {
		if (row.kind === "file") {
			const isExpanded = expanded.get(row.file.name)?.full === true;
			const isViewed = viewed.has(row.file.name);
			return (
				<header className="review-diff-file-header" data-file-path={row.file.name} data-viewed={isViewed}>
					<span className="review-diff-file-name">{fileLabel(row.file)}</span>
					<div className="review-diff-file-controls">
						{onViewed && (
							<Checkbox
								label="Viewed"
								checked={isViewed}
								onCheckedChange={(next) => onViewed(row.file.name, next)}
								className="review-diff-viewed"
							/>
						)}
						{loadFile && row.file.hunks.length > 0 && !isViewed ? (
							<Tooltip content={isExpanded ? "Show patch only" : "Show full file"}>
								<IconButton
									label={isExpanded ? "Show patch only" : "Show full file"}
									icon={isExpanded ? <ArrowsInLineVertical /> : <ArrowsOutLineVertical />}
									onClick={() => void toggleFile(row.file)}
								/>
							</Tooltip>
						) : null}
					</div>
				</header>
			);
		}
		if (row.kind === "hunk") {
			const gap = row.gap;
			const control = (target: GapControls, direction: "down" | "up" | "all", label: string, icon: ReactElement) => (
				<Tooltip content={label}>
					<IconButton size="xs" label={label} icon={icon} onClick={() => void expandGap(row.file, target, direction)} />
				</Tooltip>
			);
			return (
				<div className="review-diff-hunk-header">
					<span className="review-diff-hunk-controls">
						{gap?.up ? control(gap, "up", "Expand up", <ArrowLineUp />) : null}
						{gap?.down ? control(gap, "down", "Expand down", <ArrowLineDown />) : null}
						{gap?.all ? control(gap, "all", "Expand all", <ArrowsOutLineVertical />) : null}
					</span>
					<span>{hunkLabel(row.specs, gap)}</span>
				</div>
			);
		}
		if (row.kind === "annotation") return <>{row.annotations.map(annotation)}</>;
		if (row.kind === "notice") return <p className="review-diff-notice">{row.text}</p>;
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
	return (
		<VirtualDiffRows
			rows={rows}
			mode={mode}
			theme={theme}
			selectedFile={selectedFile}
			selectedAnchor={selectedAnchor}
			renderRow={renderRow}
		/>
	);
}
