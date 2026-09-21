// Whether a ticket changed place between two lists of ticket ids: the
// tickets that both lists hold stand in a different order. A ticket that
// joins or leaves the list, as when a group collapses or expands, moves no
// other ticket out of order.
export function ticketOrderChanged(previous: readonly string[], next: readonly string[]) {
	const nextIds = new Set(next);
	const previousIds = new Set(previous);
	const kept = previous.filter((id) => nextIds.has(id));
	const keptNext = next.filter((id) => previousIds.has(id));
	return kept.some((id, index) => keptNext[index] !== id);
}
