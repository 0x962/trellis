import type { StatusCategory } from "@trellis/api";

// One ticket row of the table, as the wash rule reads it.
export type WashRow = { id: string; group: string; category: StatusCategory };

export type WashPlay = {
	// The tickets that turned done since the last call.
	started: readonly string[];
	// The groups whose progress circle draws full.
	waves: readonly string[];
	// The record to compare the next call against.
	next: ReadonlyMap<string, boolean>;
};

// A canceled ticket asks for no more work, so it leaves a wave complete.
const closed = (row: WashRow) => row.category === "done" || row.category === "canceled";

// The tickets whose status turned done since the last call, the waves that
// draw a full circle, and the record to compare the next call against.
//
// A ticket the record does not already hold is written down and nothing
// else: a ticket that is already done when the page opens, and a ticket
// that a filter or a sort first brings into the list, plays nothing. The
// record keeps every ticket it has ever seen, so a ticket that leaves the
// list and comes back plays nothing either. A ticket that is reopened and
// closed again is a second change, and it plays a second time.
//
// The record holds the ticket id, never the position of the row, so a
// scroll moves no play state from one row to another.
//
// A wave joins `waves` when a ticket that just turned done leaves no open
// row in its group. The rows carry the same status as the ticket that
// changed, so the rows answer in the moment of the change; the counts of
// the wave arrive from the server later, and `reported` holds the waves
// those counts already call done. A wave stays in `waves` until its counts
// arrive or a row of it opens again, so the circle never steps back from
// full to the share it held before.
export function doneStarts(
	seen: ReadonlyMap<string, boolean>,
	rows: readonly WashRow[],
	waves: readonly string[],
	reported: ReadonlySet<string>,
): WashPlay {
	const next = new Map(seen);
	const started: string[] = [];
	const open = new Set(rows.filter((row) => !closed(row)).map((row) => row.group));
	const full = waves.filter((group) => !open.has(group) && !reported.has(group));
	for (const row of rows) {
		const done = row.category === "done";
		if (done && seen.get(row.id) === false) {
			started.push(row.id);
			if (!open.has(row.group) && !reported.has(row.group) && !full.includes(row.group)) full.push(row.group);
		}
		next.set(row.id, done);
	}
	return { started, waves: full, next };
}
