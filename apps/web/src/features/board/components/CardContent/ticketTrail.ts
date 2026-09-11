// The identifiers a card prints above its title: every ticket above this
// one, then the ticket itself. A deep tree keeps the two ends a reader
// needs, the top of the tree and the ticket the card is under, and stands
// the rest in for one gap mark.
//
// OP-9 alone for a ticket with no parent.
// OP-4, OP-6, OP-9 for one ancestor above the parent.
// OP-4, gap, OP-9, OP-10 for anything deeper.
export const gap = "…";

export const ticketTrail = (ancestors: readonly string[], identifier: string): string[] => {
	const chain = [...ancestors, identifier];
	if (chain.length <= 3) return chain;
	return [chain[0]!, gap, chain[chain.length - 2]!, chain[chain.length - 1]!];
};
