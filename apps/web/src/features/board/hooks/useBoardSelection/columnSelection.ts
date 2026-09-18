// One board selection holds cards of one column only. A person who selects
// a card of another column starts a new selection there.

// `toggle` is the `x` key and a cmd or ctrl click. `extend` is `shift+j`,
// `shift+k`, and a shift click.
export type SelectAction = "toggle" | "extend";

export type ColumnSelectionStep = {
	// True when every card that was selected before this action loses its
	// selection.
	reset: boolean;
	// What runs on the named card after the reset. A range needs a card to
	// start from, and a reset leaves the new column with none, so an extend
	// there selects the one card the person named.
	action: SelectAction;
};

export const columnSelectionStep = (
	// The column whose cards are selected now, or null while no card is
	// selected.
	selectionColumnId: string | null,
	// The column of the card the person acts on.
	targetColumnId: string,
	action: SelectAction,
): ColumnSelectionStep => {
	const reset = selectionColumnId !== null && selectionColumnId !== targetColumnId;
	return { reset, action: reset ? "toggle" : action };
};
