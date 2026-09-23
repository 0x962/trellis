import { doneWashMs, useReducedMotion } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import type { TableItem } from "../../../../utils/flattenGroups";
import { doneStarts } from "./doneStarts";

// What the hook returns while no row plays.
const nothing: { tickets: readonly string[]; waves: readonly string[] } = { tickets: [], waves: [] };

const same = (one: readonly string[], two: readonly string[]) =>
	one.length === two.length && one.every((value, index) => two[index] === value);

// The tickets whose rows play the green wash right now, and the wave groups
// whose progress circle draws full beside them.
//
// The hook reads the whole list, not only the rows on screen, so a ticket
// that is marked done while its row is scrolled away is written down as
// done and stays quiet when the person scrolls back to it.
//
// The record of what each ticket's status said last lives in a ref, so a
// scroll, a re-render and a refetch all compare against the same record and
// start nothing. A fresh visit to the page builds an empty record, and an
// empty record starts nothing.
//
// The band and the circle end at different moments. A timer takes the band
// off the row after `doneWashMs`. The circle holds its full share until the
// counts of the wave arrive and turn the header into the done mark.
//
// The person who asked the system for less motion gets the done row at
// once: the lists stay empty, so no band and no fill mounts.
export function useDoneWash(items: readonly TableItem[]) {
	const reducedMotion = useReducedMotion();
	const seen = useRef<ReadonlyMap<string, boolean>>(new Map());
	const waves = useRef<readonly string[]>([]);
	const [playing, setPlaying] = useState<{ tickets: readonly string[]; waves: readonly string[] }>(nothing);

	useEffect(() => {
		const rows = items.flatMap((item) =>
			item.kind === "row" ? [{ id: item.ticket.id, group: item.group.key, category: item.ticket.status.category }] : [],
		);
		const reported = new Set(
			items.flatMap((item) => (item.kind === "header" && item.group.done === true ? [item.group.key] : [])),
		);
		const play = doneStarts(seen.current, rows, waves.current, reported);
		seen.current = play.next;
		const quiet = reducedMotion || document.visibilityState === "hidden";
		waves.current = quiet ? [] : play.waves;
		setPlaying((current) => {
			const tickets = quiet ? current.tickets : [...current.tickets, ...play.started];
			if (same(tickets, current.tickets) && same(waves.current, current.waves)) return current;
			return { tickets, waves: waves.current };
		});
	}, [items, reducedMotion]);

	// The band holds its last frame, which is clear, so one timer for the
	// whole group takes every band off the page together.
	useEffect(() => {
		if (playing.tickets.length === 0) return;
		const timer = setTimeout(() => setPlaying((current) => ({ ...current, tickets: [] })), doneWashMs);
		return () => clearTimeout(timer);
	}, [playing]);

	return playing;
}
