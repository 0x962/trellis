import { readRowMotion, useReducedMotion } from "@trellis/ui";
import { animate } from "motion/mini";
import { type RefObject, useLayoutEffect, useRef } from "react";
import type { TableItem } from "../../../../utils/flattenGroups";
import { ticketOrderChanged } from "./ticketOrderChanged";

// True for the box that holds the header of one group. The browser reads the
// offset and the height of that box to hold the header at the top of the
// list, so nothing here writes to it.
const isGroupBox = (line: HTMLElement) => line.dataset.waveBox !== undefined;

// The offset that a line's `translateY` style gives it inside the virtual
// body. The lines hold no other transform.
const topOf = (line: HTMLElement) => new DOMMatrixReadOnly(line.style.transform).m42;

// Slides the lines of the virtual body from their old offset to their new
// one when a ticket changes place, as when a status change sorts it into
// another group. Every line that moves slides, so the lines a ticket passes
// and the child lines under it slide with it.
//
// React moves the DOM node of a reordered line, and a moved node starts no
// CSS transition, so the slide is an animation that starts after the commit.
// A line that mounts in this commit has no old offset and does not slide,
// so the first render and a line that a scroll brings into view do not
// move. A scroll changes no offset. A collapse or an expand of a group
// changes no ticket order, so the lines under it jump.
export function useLineMotion(body: RefObject<HTMLDivElement | null>, items: readonly TableItem[]) {
	const reducedMotion = useReducedMotion();
	// The offset of each line at the last commit, by DOM element.
	const tops = useRef(new WeakMap<Element, number>());
	const ticketIds = useRef<readonly string[]>([]);
	const motions = useRef<ReturnType<typeof animate>[]>([]);

	useLayoutEffect(() => {
		const ids = items.flatMap((item) => (item.kind === "row" ? [item.ticket.id] : []));
		const moved = ticketOrderChanged(ticketIds.current, ids);
		ticketIds.current = ids;
		if (body.current === null) return;
		const lines = ([...body.current.children] as HTMLElement[]).filter((line) => !isGroupBox(line));
		const previous = new Map(lines.map((line) => [line, tops.current.get(line)]));
		for (const line of lines) tops.current.set(line, topOf(line));
		if (!moved || reducedMotion) return;
		for (const motion of motions.current) motion.complete();
		motions.current = [];
		const transition = readRowMotion(body.current);
		for (const line of lines) {
			const from = previous.get(line);
			const to = topOf(line);
			if (from === undefined || from === to) continue;
			motions.current.push(animate(line, { transform: [`translateY(${from}px)`, `translateY(${to}px)`] }, transition));
		}
	});
}
