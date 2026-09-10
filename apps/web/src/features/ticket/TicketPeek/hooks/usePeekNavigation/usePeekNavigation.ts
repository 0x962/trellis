import { useHotkey } from "@trellis/ui";
import type { PeekRow } from "../../providers/PeekListProvider";

export type PeekNavigationOptions = {
	rows: readonly PeekRow[];
	// The identifier the peek shows.
	current: string;
	onStep: (identifier: string) => void;
};

// j and k walk the visible rows of the list while the peek shows one of
// them. With no peek open, both keys belong to the list. The walk stops at
// both ends; it never wraps.
export const usePeekNavigation = ({ rows, current, onStep }: PeekNavigationOptions) => {
	const visible = rows.filter((row) => row.visible).map((row) => row.identifier);
	const index = visible.indexOf(current);
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
