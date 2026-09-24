import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

// What the server answers when a call would open a process for a session that
// a person put away, or move it into a project. The state of the session
// refuses the call, not the input, so the code is SESSION_ARCHIVED with
// status 409 and a client reads the code in place of the sentence.
export const archivedSessionRefusal = () => fail("SESSION_ARCHIVED");

// The same state refuses a move, and the sentence names the rule that the
// move breaks.
export const archivedSessionMoveRefusal = () =>
	fail("SESSION_ARCHIVED", undefined, "An archived session belongs to no project. Bring the session back first.");

// The archive time of the session that owns this run, or null. A run that no
// session row names answers null, because only a session can be archived.
export const runArchivedAt = async (tx: Tx, runId: string) => {
	const [row] = await rows<{ archivedAt: string | null }>(
		tx,
		sql`SELECT ${iso(sql`archived_at`)} AS "archivedAt" FROM sessions WHERE run_id = ${runId}`,
	);
	return row?.archivedAt ?? null;
};
