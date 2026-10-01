import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualRows } from "../../../../../../../hooks/useVirtualRows";
import type { ContentsHeading } from "../../../DocumentContents";

type Measurement = ContentsHeading & { width: number; height: number };

export function useContentsRows(viewport: RefObject<HTMLDivElement | null>, headings: readonly ContentsHeading[]) {
	const [geometry, setGeometry] = useState({ width: 0, minimum: 44 });
	const measured = useRef(new Map<string, Measurement>());
	const frame = useRef<number | null>(null);
	const [revision, setRevision] = useState(0);
	useLayoutEffect(() => {
		const ids = new Set(headings.map((heading) => heading.id));
		for (const id of measured.current.keys()) {
			if (!ids.has(id)) measured.current.delete(id);
		}
	}, [headings]);
	useLayoutEffect(
		() => () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
			frame.current = null;
			measured.current.clear();
		},
		[],
	);
	useLayoutEffect(() => {
		const element = viewport.current!;
		const update = () => {
			const style = getComputedStyle(element);
			const width = element.clientWidth;
			const minimum =
				Number.parseFloat(style.getPropertyValue("--spacing")) * Number(style.getPropertyValue("--contents-row-steps"));
			setGeometry((current) => (current.width === width && current.minimum === minimum ? current : { width, minimum }));
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
		};
	}, [viewport]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: measured keeps one map. revision updates sizes after a batch.
	const sizes = useMemo(
		() =>
			headings.map((heading) => {
				const row = measured.current.get(heading.id);
				return row?.width === geometry.width && row.text === heading.text && row.level === heading.level
					? row.height
					: geometry.minimum;
			}),
		[headings, revision, geometry],
	);
	const offsets = useMemo(() => {
		const result = [0];
		for (const size of sizes) result.push(result.at(-1)! + size);
		return result;
	}, [sizes]);
	const virtual = useVirtualRows(viewport, sizes, 3);
	const measure = useCallback((row: Measurement) => {
		const previous = measured.current.get(row.id);
		if (
			previous?.height === row.height &&
			previous.width === row.width &&
			previous.text === row.text &&
			previous.level === row.level
		)
			return;
		measured.current.set(row.id, row);
		if (frame.current === null) {
			frame.current = requestAnimationFrame(() => {
				frame.current = null;
				setRevision((value) => value + 1);
			});
		}
	}, []);
	return { ...virtual, offsets, measure, minimum: geometry.minimum };
}
