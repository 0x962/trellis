import { createElement, type ReactNode, useEffect, useMemo, useRef } from "react";
import { useVirtualRows } from "../useVirtualRows";
import { reviewRowSize, type ReviewRow } from "./reviewRows";

export function VirtualDiffRows({
	rows,
	mode,
	theme,
	selectedFile,
	renderRow,
}: {
	rows: ReviewRow[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	renderRow: (row: ReviewRow) => ReactNode;
}) {
	const sizes = useMemo(() => rows.map(reviewRowSize), [rows]);
	const viewportRef = useRef<HTMLElement>(null);
	const virtual = useVirtualRows(viewportRef, sizes);
	useEffect(() => {
		const index = rows.findIndex((row) => row.kind === "file" && row.file.name === selectedFile);
		if (index >= 0) virtual.scrollToIndex(index);
	}, [rows, selectedFile, virtual.scrollToIndex]);
	return createElement(
		"diffs-container",
		{ className: "review-code", "data-diff-type": mode, "data-theme": theme, ref: viewportRef },
		<div aria-hidden="true" style={{ height: virtual.before }} />,
		...rows.slice(virtual.start, virtual.end).map((row) => <div key={row.key}>{renderRow(row)}</div>),
		<div aria-hidden="true" style={{ height: virtual.after }} />,
	);
}
