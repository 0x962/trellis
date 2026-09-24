import { useVirtualizer } from "@tanstack/react-virtual";
import type { Session, SessionStatus } from "@trellis/api";
import { useMediaQuery } from "@trellis/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { SessionRow } from "../../../components/SessionRow";

// The drawn height of one row plus the gap under it. `sidebar-row` is 32 px,
// and a coarse pointer draws it at 44 px.
const rowHeight = (coarse: boolean) => (coarse ? 44 : 32) + 2;

// The box that scrolls around these rows. The sidebar owns it, and this file
// must not reach into the sidebar to name it, so the list reads the first
// ancestor that scrolls.
const scrollParentOf = (node: HTMLElement | null): HTMLElement | null => {
	for (let element = node?.parentElement ?? null; element !== null; element = element.parentElement) {
		const overflow = getComputedStyle(element).overflowY;
		if (overflow === "auto" || overflow === "scroll") return element;
	}
	return null;
};

// Where the list starts inside the box that scrolls. The virtual window reads
// the scroll position of that box, and this number turns it into a position
// inside the list.
const offsetIn = (list: HTMLElement, scroller: HTMLElement) =>
	list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

export type ArchivedSessionRowsProps = {
	sessions: readonly Session[];
	statuses: Record<string, SessionStatus> | undefined;
	// The path of the open page, so the row of that session reads as current.
	pathname: string;
};

// The rows of the archived group. The archive only grows, and every row holds
// a menu with its own query, so the list draws one screen of rows and two
// spacers that stand for the rows above and below it. The DOM then holds a
// fixed number of rows whatever the number of archived sessions.
//
// The window follows the scroll of the sidebar itself. A box of its own would
// take the height the project list needs on a short window, and a wheel over
// that box would move the box in place of the sidebar.
export function ArchivedSessionRows({ sessions, statuses, pathname }: ArchivedSessionRowsProps) {
	const list = useRef<HTMLUListElement>(null);
	const coarse = useMediaQuery("(pointer: coarse)");
	const height = rowHeight(coarse);
	const [scroller, setScroller] = useState<{ element: HTMLElement; margin: number } | null>(null);
	// The rows above this list change height when a person opens a project or
	// the window resizes, so the start of the list is read again each time the
	// box that scrolls changes size.
	useLayoutEffect(() => {
		const element = scrollParentOf(list.current);
		if (element === null) return;
		const measure = () => setScroller({ element, margin: offsetIn(list.current!, element) });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const virtualizer = useVirtualizer({
		count: sessions.length,
		getScrollElement: () => scroller?.element ?? null,
		estimateSize: () => height,
		scrollMargin: scroller?.margin ?? 0,
		enabled: scroller !== null,
		overscan: 6,
		getItemKey: (index) => sessions[index]!.id,
	});
	const items = virtualizer.getVirtualItems();
	// A layout with no box that scrolls, such as a test host, keeps every row.
	// A window with no measurement would draw an empty group.
	const drawn = scroller === null ? sessions.map((_session, index) => index) : items.map((item) => item.index);
	const start = items.length === 0 ? 0 : items[0]!.start - virtualizer.options.scrollMargin;
	const above = scroller === null ? 0 : start;
	const below =
		scroller === null || items.length === 0
			? 0
			: virtualizer.getTotalSize() - (items[items.length - 1]!.end - virtualizer.options.scrollMargin);
	return (
		<ul ref={list} className="flex flex-col gap-0.5">
			{above > 0 && <li aria-hidden="true" style={{ height: `${above}px` }} />}
			{drawn.map((index) => {
				const session = sessions[index]!;
				return (
					<SessionRow
						key={session.id}
						session={session}
						status={statuses?.[session.id] ?? "unavailable"}
						active={pathname === `/sessions/${session.id}`}
					/>
				);
			})}
			{below > 0 && <li aria-hidden="true" style={{ height: `${below}px` }} />}
		</ul>
	);
}
