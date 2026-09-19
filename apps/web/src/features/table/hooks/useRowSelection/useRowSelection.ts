import { useCallback, useMemo, useState } from "react";

export type RowSelectionOptions = {
	// The id of every row a person can see, in display order. A row inside a
	// collapsed group is not one of them, so no key and no range reaches it.
	ids: readonly string[];
};

// The selected rows in display order, and how many there are. Both read the
// same list, so a row that leaves the view, such as a ticket a live patch
// moves out of the filter, leaves the count as well. The bulk bar prints
// `count` and every bulk action writes `selected`, and the two must name the
// same rows.
export const selectionOf = (
	ids: readonly string[],
	selected: ReadonlySet<string>,
): { selected: string[]; count: number } => {
	const rows = ids.filter((id) => selected.has(id));
	return { selected: rows, count: rows.length };
};

export type RowSelection = {
	selected: string[];
	count: number;
	isSelected: (id: string) => boolean;
	// `x` on a row. The row becomes the anchor of the next range.
	toggle: (id: string) => void;
	// Shift+j, Shift+k, or a Shift-click. The range runs from the anchor to
	// `id`; the rows selected before the range started stay selected.
	extend: (id: string) => void;
	// Cmd+A: every id of the view.
	selectAll: () => void;
	clear: () => void;
};

type State = { base: Set<string>; anchor: string | null; selected: Set<string> };

const empty: State = { base: new Set(), anchor: null, selected: new Set() };

// A selection is a set of ids, so a row keeps its state when the rows
// reorder under a live patch or a virtual row unmounts.
export const useRowSelection = ({ ids }: RowSelectionOptions): RowSelection => {
	const [state, setState] = useState<State>(empty);

	const toggle = useCallback((id: string) => {
		setState((current) => {
			const selected = new Set(current.selected);
			if (selected.has(id)) selected.delete(id);
			else selected.add(id);
			return { base: selected, anchor: id, selected };
		});
	}, []);

	const extend = useCallback(
		(id: string) => {
			setState((current) => {
				if (current.anchor === null) {
					const selected = new Set(current.selected).add(id);
					return { base: selected, anchor: id, selected };
				}
				const from = ids.indexOf(current.anchor);
				const to = ids.indexOf(id);
				const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
				return { ...current, selected: new Set([...current.base, ...range]) };
			});
		},
		[ids],
	);

	const selectAll = useCallback(() => {
		setState({ base: new Set(ids), anchor: null, selected: new Set(ids) });
	}, [ids]);

	const clear = useCallback(() => setState(empty), []);

	const view = useMemo(() => selectionOf(ids, state.selected), [ids, state.selected]);

	const isSelected = useCallback((id: string) => state.selected.has(id), [state.selected]);

	return { selected: view.selected, count: view.count, isSelected, toggle, extend, selectAll, clear };
};
