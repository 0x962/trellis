import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { tabBoxes, tabStripWidth, visibleTabRange } from "../tabGeometry";
import type { TabSlot } from "../tabSlots";

// Scrolls the tab at `left` into view. If a tab exceeds the visible width,
// keep its left edge visible so the start of its name remains readable.
const revealTab = (element: HTMLElement, left: number, width: number) => {
	if (left + width > element.scrollLeft + element.clientWidth) element.scrollLeft = left + width - element.clientWidth;
	if (left < element.scrollLeft) element.scrollLeft = left;
};

// The canvas measures every title so tabs outside the viewport can keep their controls unmounted.
export function useTabLayout(slots: readonly TabSlot[], activeIndex: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState(() => ({
		boxes: tabBoxes(
			slots.map(() => 200),
			0,
		),
		start: Math.max(0, activeIndex - 2),
		end: Math.min(slots.length, activeIndex + 3),
		viewportWidth: 0,
	}));
	useLayoutEffect(() => {
		const element = ref.current!;
		const context = document.createElement("canvas").getContext("2d")!;
		const measure = () => {
			const style = getComputedStyle(element);
			const spacing = Number.parseFloat(style.getPropertyValue("--spacing"));
			const actionWidth = Number.parseFloat(style.getPropertyValue("--tab-control-steps")) * spacing;
			const weight = style.getPropertyValue("--font-weight-medium");
			const maxWidth = spacing * 60;
			const widths = slots.map((slot) => {
				const size = slot.kind === "group" ? style.getPropertyValue("--text-xs") : style.fontSize;
				context.font = `${weight} ${size} ${style.fontFamily}`;
				if (slot.kind === "group") {
					return Math.min(
						maxWidth,
						Math.ceil(
							context.measureText(slot.group.name).width +
								context.measureText(String(slot.count)).width +
								spacing * 12 +
								actionWidth,
						),
					);
				}
				const labelWidth = Math.ceil(context.measureText(slot.tab.title).width);
				return slot.tab.pinned
					? Math.min(maxWidth, Math.max(actionWidth, labelWidth + spacing * 7.5))
					: Math.min(maxWidth, Math.max(actionWidth, labelWidth + spacing * 4) + actionWidth + spacing);
			});
			const boxes = tabBoxes(widths, spacing);
			const viewportWidth = element.clientWidth;
			const range = visibleTabRange(boxes, element.scrollLeft, viewportWidth);
			setLayout((current) =>
				current.start === range.start &&
				current.end === range.end &&
				current.viewportWidth === viewportWidth &&
				current.boxes.length === boxes.length &&
				current.boxes.every((box, index) => box.width === boxes[index]!.width && box.left === boxes[index]!.left)
					? current
					: { boxes, ...range, viewportWidth },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		document.fonts.addEventListener("loadingdone", measure);
		return () => {
			observer.disconnect();
			document.fonts.removeEventListener("loadingdone", measure);
		};
	}, [slots]);
	useLayoutEffect(() => {
		const element = ref.current!;
		const active = layout.boxes[activeIndex];
		if (active) revealTab(element, active.left, active.width);
		setLayout((current) => {
			const range = visibleTabRange(current.boxes, element.scrollLeft, element.clientWidth);
			return current.start === range.start && current.end === range.end ? current : { ...current, ...range };
		});
	}, [layout.boxes, activeIndex]);
	const onScroll = useCallback(() => {
		const element = ref.current!;
		setLayout((current) => {
			const range = visibleTabRange(current.boxes, element.scrollLeft, element.clientWidth);
			return current.start === range.start && current.end === range.end ? current : { ...current, ...range };
		});
	}, []);
	const indexes = Array.from(
		{ length: Math.max(0, layout.end - layout.start) },
		(_, offset) => layout.start + offset,
	).filter((index) => index < slots.length);
	if (activeIndex >= 0 && !indexes.includes(activeIndex)) indexes.push(activeIndex);
	return {
		ref,
		boxes: layout.boxes,
		width: tabStripWidth(layout.boxes),
		indexes: indexes.sort((a, b) => a - b),
		onScroll,
	};
}
