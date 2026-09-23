import { createElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { diffRowSlots, diffRowStyle } from "./diffRowSlots";
import type { DiffAnchor } from "./ReviewDiff";
import { type ReviewRow, reviewRowSize, rowAnnotations } from "./reviewRows";
import { useVirtualRows } from "./useVirtualRows";

// A wrapper that reports the height of variable-height annotation content:
// a file-level annotation row, or a line row with a thread or the composer
// under it. The virtual list starts from the estimate and corrects itself
// once the row mounts. A zero height means the host reports no layout, so
// the estimate stands and tests keep deterministic offsets.
function MeasuredAnnotation({
	rowKey,
	onMeasure,
	children,
}: {
	rowKey: string;
	onMeasure: (key: string, height: number) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = ref.current!;
		const update = () => {
			const height = element.offsetHeight;
			if (height > 0) onMeasure(rowKey, height);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [rowKey, onMeasure]);
	return <div ref={ref}>{children}</div>;
}

// A row whose height the stylesheet does not pin: it wraps its own text, so
// only the drawn row knows how tall it is. Every other row draws the height
// that `diffRowHeights` states.
const measurable = (row: ReviewRow) => row.kind === "annotation" || row.kind === "notice" || rowAnnotations(row) > 0;

const anchorMatches = (row: ReviewRow, anchor: DiffAnchor) => {
	if (row.kind === "unified")
		return (
			row.file.name === anchor.path &&
			((anchor.side === "old" && row.line.oldLine === anchor.line) ||
				(anchor.side === "new" && row.line.newLine === anchor.line))
		);
	if (row.kind !== "split" || row.file.name !== anchor.path) return false;
	return anchor.side === "old" ? row.oldLine?.oldLine === anchor.line : row.newLine?.newLine === anchor.line;
};

export function VirtualDiffRows({
	rows,
	mode,
	theme,
	selectedFile,
	selectedAnchor,
	renderRow,
}: {
	rows: ReviewRow[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	selectedAnchor?: DiffAnchor | null;
	renderRow: (row: ReviewRow) => ReactNode;
}) {
	const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map());
	const onMeasure = useCallback((key: string, height: number) => {
		setMeasured((current) => (current.get(key) === height ? current : new Map(current).set(key, height)));
	}, []);
	// Both panes of the review read the same two queries. `GroupTree` sets its
	// own row height from the pointer, and `FileRiskGroups` its own header
	// height from the width.
	const coarse = useMediaQuery("(pointer: coarse)");
	const phone = useMediaQuery("(max-width: 767px)");
	const slots = useMemo(() => diffRowSlots(coarse, phone), [coarse, phone]);
	const sizes = useMemo(
		() =>
			rows.map((row) =>
				measurable(row) ? (measured.get(row.key) ?? reviewRowSize(row, slots)) : reviewRowSize(row, slots),
			),
		[rows, measured, slots],
	);
	const viewportRef = useRef<HTMLElement>(null);
	const virtual = useVirtualRows(viewportRef, sizes);
	// Opening a comment composer rebuilds every row. Only a move to another
	// file scrolls the list, so the reviewer keeps the place they scrolled to.
	const scrolledTo = useRef<string | undefined>(undefined);
	useEffect(() => {
		const target = selectedAnchor
			? `${selectedAnchor.path}:${selectedAnchor.side}:${selectedAnchor.line}`
			: selectedFile;
		if (target === scrolledTo.current) return;
		scrolledTo.current = target;
		const anchored = selectedAnchor ? rows.findIndex((row) => anchorMatches(row, selectedAnchor)) : -1;
		// The diff draws a thread of an earlier revision on the line its text
		// moved to, or at the top of its file, so the line the thread names can
		// have no row at all. The list then goes to the header of the file.
		const path = selectedAnchor?.path ?? selectedFile;
		const index = anchored >= 0 ? anchored : rows.findIndex((row) => row.kind === "file" && row.file.name === path);
		if (index >= 0) virtual.scrollToIndex(index);
	}, [rows, selectedFile, selectedAnchor, virtual.scrollToIndex]);
	return createElement(
		"diffs-container",
		{
			className: "review-code",
			"data-diff-type": mode,
			"data-theme": theme,
			ref: viewportRef,
			style: diffRowStyle(coarse),
		},
		<div aria-hidden="true" style={{ height: virtual.before }} />,
		...rows.slice(virtual.start, virtual.end).map((row) =>
			measurable(row) ? (
				<MeasuredAnnotation key={row.key} rowKey={row.key} onMeasure={onMeasure}>
					{renderRow(row)}
				</MeasuredAnnotation>
			) : (
				<div key={row.key}>{renderRow(row)}</div>
			),
		),
		<div aria-hidden="true" style={{ height: virtual.after }} />,
	);
}
