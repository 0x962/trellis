import { useVirtualizer } from "@tanstack/react-virtual";
import type { Session, SessionStatus } from "@trellis/api";
import { useMediaQuery } from "@trellis/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SessionRow } from "../../../components/SessionRow";

// The drawn height of one row plus the gap under it. `sidebar-row` is 32 px,
// and a coarse pointer draws it at 44 px.
const rowHeight = (coarse: boolean) => (coarse ? 44 : 32) + 2;

// How many rows the box shows before it scrolls. The archive only grows, so
// the box holds this many rows whatever the count behind it.
const visibleRows = 8;

export type ArchivedSessionRowsProps = {
	sessions: readonly Session[];
	statuses: Record<string, SessionStatus> | undefined;
	// The path of the open page, so the row of that session reads as current.
	pathname: string;
};

// The rows of the archived group, in a box that scrolls. The list draws the
// rows inside the box and two spacers that stand for the rows above and below
// it, so the DOM holds one screen of rows whatever the number of archived
// sessions. Every row is the same `SessionRow` the session list draws, with
// its name, its status and its menu.
export function ArchivedSessionRows({ sessions, statuses, pathname }: ArchivedSessionRowsProps) {
	const viewport = useRef<HTMLDivElement>(null);
	const coarse = useMediaQuery("(pointer: coarse)");
	const height = rowHeight(coarse);
	const [initialRect, setInitialRect] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const box = viewport.current!.getBoundingClientRect();
		setInitialRect({ width: box.width, height: box.height });
	}, []);
	const virtualizer = useVirtualizer({
		count: sessions.length,
		getScrollElement: () => viewport.current,
		estimateSize: () => height,
		enabled: initialRect.height > 0,
		initialRect,
		overscan: 4,
		getItemKey: (index) => sessions[index]!.id,
	});
	const active = sessions.findIndex((session) => pathname === `/sessions/${session.id}`);
	// The open page keeps its row in view, so a person who opens the group
	// from an archived session sees which row they are on.
	useEffect(() => {
		if (active !== -1) virtualizer.scrollToIndex(active, { align: "auto" });
	}, [active, virtualizer]);
	const items = virtualizer.getVirtualItems();
	const above = items.length === 0 ? 0 : items[0]!.start;
	const below = items.length === 0 ? 0 : virtualizer.getTotalSize() - items[items.length - 1]!.end;
	return (
		<div ref={viewport} style={{ maxHeight: `${visibleRows * height}px` }} className="overflow-y-auto">
			<ul className="flex flex-col gap-0.5">
				{above > 0 && <li aria-hidden="true" style={{ height: `${above}px` }} />}
				{items.map((virtual) => {
					const session = sessions[virtual.index]!;
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
		</div>
	);
}
