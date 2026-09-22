import { createElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualRows } from "../useVirtualRows";
import type { DiffAnchor } from "./ReviewDiff";
import { type ReviewRow, reviewRowSize, rowAnnotations } from "./reviewRows";

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

const measurable = (row: ReviewRow) => row.kind === "annotation" || rowAnnotations(row) > 0;

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
	const sizes = useMemo(
		() => rows.map((row) => (measurable(row) ? (measured.get(row.key) ?? reviewRowSize(row)) : reviewRowSize(row))),
		[rows, measured],
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
		const index = selectedAnchor
			? rows.findIndex((row) => anchorMatches(row, selectedAnchor))
			: rows.findIndex((row) => row.kind === "file" && row.file.name === selectedFile);
		if (index >= 0) virtual.scrollToIndex(index);
	}, [rows, selectedFile, selectedAnchor, virtual.scrollToIndex]);
	return createElement(
		"diffs-container",
		{ className: "review-code", "data-diff-type": mode, "data-theme": theme, ref: viewportRef },
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
