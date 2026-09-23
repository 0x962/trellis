import { confettiMs, useReducedMotion } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import type { TableItem } from "../../../../utils/flattenGroups";
import { confettiStarts } from "./confettiStarts";

// How many bars may celebrate at the same time. A merge queue can turn
// several rows green in one poll, and seven pieces on every one of them
// would read as a shower over the whole table.
const atOnce = 2;

// The ids of the pull requests whose check bars celebrate right now.
//
// The hook reads the whole list, not only the rows on screen, so a row that
// turns green while it is scrolled away is written down as all-passed and
// stays quiet when the person scrolls back to it.
//
// The record of what each row's checks said last lives in a ref, so a
// scroll, a re-render and a refetch all compare against the same numbers
// and start nothing. A fresh visit to the page builds an empty record, and
// an empty record starts nothing.
export function useCheckConfetti(items: readonly TableItem[]): readonly string[] {
	const reducedMotion = useReducedMotion();
	const seen = useRef<ReadonlyMap<string, boolean>>(new Map());
	const [playing, setPlaying] = useState<readonly string[]>([]);

	useEffect(() => {
		const prs = items.flatMap((item) => (item.kind === "pr" ? [item.pr] : []));
		const { started, next } = confettiStarts(seen.current, prs);
		seen.current = next;
		if (started.length === 0) return;
		if (reducedMotion || document.visibilityState === "hidden") return;
		setPlaying((current) => [...current, ...started.slice(0, Math.max(0, atOnce - current.length))]);
	}, [items, reducedMotion]);

	// The pieces hold their last frame, which is invisible, so one timer for
	// the whole group takes them all off the page together.
	useEffect(() => {
		if (playing.length === 0) return;
		const timer = setTimeout(() => setPlaying([]), confettiMs);
		return () => clearTimeout(timer);
	}, [playing]);

	return playing;
}
