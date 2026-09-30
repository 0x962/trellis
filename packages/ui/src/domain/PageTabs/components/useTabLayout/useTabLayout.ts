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
		boxes: tabBoxes(slots.map(() => 200)),
		start: Math.max(0, activeIndex - 2),
		end: Math.min(slots.length, activeIndex + 3),
	}));
	useLayoutEffect(() => {
		const element = ref.current!;
		const context = document.createElement("canvas").getContext("2d")!;
		const touch = matchMedia("(width < 640px), (pointer: coarse)");
		const measure = () => {
			const style = getComputedStyle(element);
			const actionWidth = touch.matches ? 44 : 28;
			const widths = slots.map((slot) => {
				const size = slot.kind === "group" ? style.getPropertyValue("--text-xs") : style.fontSize;
				context.font = `500 ${size} ${style.fontFamily}`;
				if (slot.kind === "group") {
					return Math.min(
						240,
						Math.ceil(
							context.measureText(slot.group.name).width +
								context.measureText(String(slot.count)).width +
								48 +
								actionWidth,
						),
					);
				}
				const labelWidth = Math.ceil(context.measureText(slot.tab.title).width);
				return slot.tab.pinned
					? Math.min(240, Math.max(actionWidth, labelWidth + 30))
					: Math.min(240, Math.max(actionWidth, labelWidth + 16) + actionWidth + 4);
			});
			const boxes = tabBoxes(widths);
			const active = boxes[activeIndex];
			if (active) revealTab(element, active.left, active.width);
			const range = visibleTabRange(boxes, element.scrollLeft, element.clientWidth);
			setLayout((current) =>
				current.start === range.start &&
				current.end === range.end &&
				current.boxes.length === boxes.length &&
				current.boxes.every((box, index) => box.width === boxes[index]!.width)
					? current
					: { boxes, ...range },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		touch.addEventListener("change", measure);
		document.fonts.addEventListener("loadingdone", measure);
		return () => {
			observer.disconnect();
			touch.removeEventListener("change", measure);
			document.fonts.removeEventListener("loadingdone", measure);
		};
	}, [slots, activeIndex]);
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
