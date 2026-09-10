import { useHotkey } from "@trellis/ui";
import { useEffect } from "react";
import type { PeekRow } from "../../providers/PeekListProvider";

export type PeekNavigationOptions = {
	rows: readonly PeekRow[];
	// The identifier the peek shows.
	current: string;
	onStep: (identifier: string) => void;
	// Loads the detail of a row that a j or k step can show next.
	onPrefetch?: (identifier: string) => void;
};

// j and k walk the visible rows of the list while the peek shows one of
// them. With no peek open, both keys belong to the list. The walk stops at
// both ends; it never wraps. The visible rows on each side of the shown row
// load while the peek shows it, so a step finds its ticket in the cache and
// never waits for the network.
export const usePeekNavigation = ({ rows, current, onStep, onPrefetch }: PeekNavigationOptions) => {
	const visible = rows.filter((row) => row.visible).map((row) => row.identifier);
	const index = visible.indexOf(current);
	const next = index === -1 ? undefined : visible[index + 1];
	const previous = index <= 0 ? undefined : visible[index - 1];
	useEffect(() => {
		if (next !== undefined) onPrefetch?.(next);
		if (previous !== undefined) onPrefetch?.(previous);
	}, [next, previous, onPrefetch]);
	useHotkey(
		"j",
		(event) => {
			if (index === -1) return;
			const next = visible[index + 1];
			if (next === undefined) return;
			event.preventDefault();
			onStep(next);
		},
		{ allowInInput: true },
	);
	useHotkey(
		"k",
		(event) => {
			if (index <= 0) return;
			event.preventDefault();
			onStep(visible[index - 1]!);
		},
		{ allowInInput: true },
	);
};
