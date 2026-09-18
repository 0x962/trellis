import { parseSuggestions, patchLines, type ReviewSuggestion, type ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";

type Anchor = Pick<ReviewThread, "path" | "side" | "startLine" | "line" | "revisionId">;

// The text the anchor lines hold in the reviewed revision. The patch of the
// revision answers for a line inside a hunk. A line outside every hunk
// comes from the client, which read the whole file.
export async function originalLines(tx: Tx, anchor: Anchor, fromClient: string[] | undefined) {
	if (anchor.revisionId !== null) {
		const [revision] = await rows<{ patch: string }>(
			tx,
			sql`SELECT document->>'patch' AS patch FROM review_revisions WHERE id = ${anchor.revisionId}`,
		);
		const found =
			revision === undefined
				? null
				: patchLines(revision.patch, anchor.path, anchor.side, anchor.startLine, anchor.line);
		if (found !== null) return found;
	}
	return fromClient ?? null;
}

// The suggestion record of a body, or null when the body carries no
// suggestion block or the original lines are unknown.
export async function suggestionFor(
	tx: Tx,
	anchor: Anchor,
	body: string,
	fromClient: string[] | undefined,
): Promise<ReviewSuggestion | null> {
	if (parseSuggestions(body).length === 0) return null;
	const original = await originalLines(tx, anchor, fromClient);
	if (original === null) return null;
	return { original, state: "open", appliedSha: null, appliedAt: null };
}

export const sameLines = (left: string[], right: string[]) =>
	left.length === right.length && left.every((line, index) => line === right[index]);

// The first block of the body is the one an apply takes.
export const firstSuggestion = (body: string) => parseSuggestions(body)[0]?.lines ?? null;
