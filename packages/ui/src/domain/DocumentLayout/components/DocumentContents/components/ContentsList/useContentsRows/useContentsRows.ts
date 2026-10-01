import { type RefObject, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useVirtualRows } from "../../../../../../../hooks/useVirtualRows";
import type { ContentsHeading } from "../../../DocumentContents";

type Measurement = ContentsHeading & { width: number; height: number };

export function useContentsRows(viewport: RefObject<HTMLDivElement | null>, headings: readonly ContentsHeading[]) {
	const [geometry, setGeometry] = useState({ width: 0, minimum: 44 });
	const [measured, setMeasured] = useState<ReadonlyMap<string, Measurement>>(() => new Map());
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
	const sizes = useMemo(
		() =>
			headings.map((heading) => {
				const row = measured.get(heading.id);
				return row?.width === geometry.width && row.text === heading.text && row.level === heading.level
					? row.height
					: geometry.minimum;
			}),
		[headings, measured, geometry],
	);
	const offsets = useMemo(() => {
		const result = [0];
		for (const size of sizes) result.push(result.at(-1)! + size);
		return result;
	}, [sizes]);
	const virtual = useVirtualRows(viewport, sizes, 3);
	const measure = useCallback((row: Measurement) => {
		setMeasured((current) => {
			const previous = current.get(row.id);
			return previous?.height === row.height &&
				previous.width === row.width &&
				previous.text === row.text &&
				previous.level === row.level
				? current
				: new Map(current).set(row.id, row);
		});
	}, []);
	return { ...virtual, offsets, measure, minimum: geometry.minimum };
}
