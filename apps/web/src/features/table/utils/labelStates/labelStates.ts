import type { TicketSummary } from "@trellis/api";

// How a set of tickets holds each label. `all` names the labels that every
// ticket in the set holds. `some` names the labels that at least one ticket
// holds and at least one ticket does not.
export type LabelStates = { all: string[]; some: string[] };

// Splits the labels of these tickets into the two states a bulk label
// picker draws. A picker checks each id of `all` and marks each id of
// `some` as mixed. An empty set of tickets holds no label at all.
//
// A pick on a checked label removes it from every ticket. A pick on a mixed
// label adds it to every ticket.
export const labelStates = (rows: readonly TicketSummary[]): LabelStates => {
	const holders = new Map<string, number>();
	for (const row of rows) {
		const seen = new Set<string>();
		for (const label of row.labels) {
			if (seen.has(label.id)) continue;
			seen.add(label.id);
			holders.set(label.id, (holders.get(label.id) ?? 0) + 1);
		}
	}
	const all: string[] = [];
	const some: string[] = [];
	for (const [id, count] of holders) {
		if (count === rows.length) all.push(id);
		else some.push(id);
	}
	return { all, some };
};
