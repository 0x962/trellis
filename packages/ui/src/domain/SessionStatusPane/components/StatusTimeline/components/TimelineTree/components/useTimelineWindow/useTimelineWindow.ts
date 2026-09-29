import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualRows } from "../../../../../../../../hooks/useVirtualRows";

type Row = { key: string; day: string; expanded: boolean; isDay: boolean };

export function useTimelineWindow(
	root: RefObject<HTMLDivElement | null>,
	rows: Row[],
	focused: string,
	selected: string,
) {
	const viewport = useRef<HTMLElement | null>(null);
	const anchor = useRef<string | null>(null);
	const [geometry, setGeometry] = useState({ prefix: 0, width: 0, mobile: false });
	const [heights, setHeights] = useState<Record<string, number>>({});
	useLayoutEffect(() => {
		const tree = root.current!;
		const container = tree.closest<HTMLElement>(".overflow-auto")!;
		viewport.current = container;
		const measure = () => {
			const next = {
				prefix: tree.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop,
				width: tree.clientWidth,
				mobile: window.matchMedia("(max-width: 767px)").matches,
			};
			setGeometry((current) =>
				current.prefix === next.prefix && current.width === next.width && current.mobile === next.mobile
					? current
					: next,
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(tree.parentElement!);
		observer.observe(container);
		return () => observer.disconnect();
	}, [root]);
	useLayoutEffect(() => {
		const remember = () => {
			const bounds = viewport.current!.getBoundingClientRect();
			const row = [...root.current!.querySelectorAll<HTMLElement>("[data-update-id], [data-day-head]")].find(
				(element) => {
					const rect = element.getBoundingClientRect();
					return rect.bottom > bounds.top && rect.top < bounds.bottom;
				},
			);
			anchor.current = row?.closest<HTMLElement>("[data-tree-key]")?.dataset.treeKey ?? null;
		};
		remember();
		const container = viewport.current!;
		container.addEventListener("scroll", remember, { passive: true });
		return () => container.removeEventListener("scroll", remember);
	});
	const keys = useMemo(() => rows.map((row) => `${row.key}:${row.expanded}:${geometry.width}`), [rows, geometry.width]);
	const sizes = useMemo(
		() => [
			geometry.prefix,
			...rows.map(
				(row, index) => heights[keys[index]!] ?? (row.isDay ? (geometry.mobile ? 44 : 32) : geometry.mobile ? 52 : 44),
			),
		],
		[rows, heights, keys, geometry],
	);
	const offsets = useMemo(() => {
		const result = [0];
		for (const size of sizes.slice(1)) result.push(result.at(-1)! + size);
		return result;
	}, [sizes]);
	const range = useVirtualRows(viewport, sizes);
	const indices = useMemo(() => {
		const result = new Set<number>();
		for (let index = Math.max(0, range.start - 1); index < range.end - 1; index++) result.add(index);
		for (const key of [focused, selected, anchor.current]) {
			const index = rows.findIndex((row) => row.key === key);
			if (index !== -1) result.add(index);
		}
		return [...result].sort((a, b) => a - b);
	}, [range.start, range.end, rows, focused, selected]);
	const measure = useCallback((key: string, height: number) => {
		setHeights((current) => (current[key] === height ? current : { ...current, [key]: height }));
	}, []);
	return { indices, offsets, keys, measure };
}
