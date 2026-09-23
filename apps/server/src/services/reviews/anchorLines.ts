import { patchLines, type ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";

// Reads the text of the lines each thread points at, for a thread that sits
// on an earlier revision of the pull request.
//
// The review page loads the patch of the newest revision, so it reads the
// text of a thread on that revision from the patch it already holds. A
// thread on an earlier revision points at line numbers of a patch the page
// never loads. The page needs the text of those lines twice: to search the
// current file for them, and to draw the old code when the current file
// holds them no more.
export const withAnchorLines = async (tx: Tx, prId: string, threads: ReviewThread[]): Promise<ReviewThread[]> => {
	const [newest] = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM review_revisions WHERE pr_id = ${prId} ORDER BY document->>'fetchedAt' DESC LIMIT 1`,
	);
	const earlier = [
		...new Set(
			threads.flatMap((thread) =>
				thread.revisionId !== null && thread.revisionId !== newest?.id ? [thread.revisionId] : [],
			),
		),
	];
	if (earlier.length === 0) return threads;
	const found = await rows<{ id: string; patch: string }>(
		tx,
		sql`SELECT id, document->>'patch' AS patch FROM review_revisions WHERE id IN (${sql.join(
			earlier.map((id) => sql`${id}`),
			sql`,`,
		)})`,
	);
	const patches = new Map(found.map((row) => [row.id, row.patch]));
	return threads.map((thread) => {
		const patch = thread.revisionId === null ? undefined : patches.get(thread.revisionId);
		if (patch === undefined) return thread;
		return { ...thread, anchorLines: patchLines(patch, thread.path, thread.side, thread.startLine, thread.line) };
	});
};
