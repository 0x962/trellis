import { type ReviewThread, reviewRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { linkScope } from "../pullRequestScope";
import { notFound, type ServiceCtx } from "../support";

export function parseRef(input: string) {
	try {
		return reviewRef(input);
	} catch {
		throw invalidInput("pr", "Use a GitHub PR URL or owner/repo#123.");
	}
}
export async function ensurePr(tx: Tx, input: string) {
	const ref = parseRef(input);
	const [pr] = await rows<{ id: string; url: string }>(
		tx,
		sql`
		INSERT INTO pull_requests (id, owner, repo, number, url, state, review_retained, created_at, updated_at)
		VALUES (${ulid()}, ${ref.owner}, ${ref.repo}, ${ref.number}, ${ref.url}, 'open', true, now(), now())
		ON CONFLICT (owner, repo, number) DO UPDATE SET review_retained = true RETURNING id, url
	`,
	);
	return pr!;
}
export async function findPr(tx: Tx, input: string) {
	const ref = parseRef(input);
	const [pr] = await rows<{ id: string; url: string }>(
		tx,
		sql`SELECT id, url FROM pull_requests WHERE owner = ${ref.owner} AND repo = ${ref.repo} AND number = ${ref.number}`,
	);
	return pr;
}
export async function readThread(tx: Tx, id: string): Promise<ReviewThread> {
	const found = await rows<{ document: ReviewThread }>(tx, sql`SELECT document FROM review_threads WHERE id = ${id}`);
	if (!found[0]) throw notFound("reviewThread", id);
	return found[0].document;
}
export async function writeThread(tx: Tx, thread: ReviewThread) {
	await tx.execute(
		sql`UPDATE review_threads SET document = ${JSON.stringify(thread)}::jsonb, updated_at = ${thread.updatedAt} WHERE id = ${thread.id}`,
	);
}
export async function changed(ctx: ServiceCtx, tx: Tx, prId: string) {
	ctx.emit({ type: "reviews.changed", id: prId, ...(await linkScope(tx, prId)) });
}
export async function assertRevision(tx: Tx, input: { prId: string; revisionId?: string | null }) {
	if (input.revisionId == null) return;
	const result = await rows(
		tx,
		sql`SELECT id FROM review_revisions WHERE id = ${input.revisionId} AND pr_id = ${input.prId}`,
	);
	if (!result.length) throw invalidInput("revisionId", "The revision belongs to another PR or does not exist.");
}
