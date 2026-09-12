import type { ReviewCreate, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import type { ServiceCtx } from "../support";
import { assertRevision, changed, ensurePr, findPr, readThread, writeThread } from "./queries";

export async function add(ctx: ServiceCtx, tx: Tx, input: ReviewCreate): Promise<ReviewThread> {
	const pr = await ensurePr(tx, input.pr);
	await assertRevision(tx, { prId: pr.id, revisionId: input.revisionId });
	const at = ctx.now().toISOString();
	const thread: ReviewThread = {
		id: ulid(),
		prId: pr.id,
		path: input.path,
		side: input.side ?? "new",
		line: input.line,
		startLine: input.startLine ?? input.line,
		revisionId: input.revisionId ?? null,
		body: input.body,
		author: ctx.actor.name,
		kind: ctx.actor.kind,
		session: ctx.session,
		status: "open",
		createdAt: at,
		updatedAt: at,
		version: 1,
		resolvedAt: null,
		resolvedBy: null,
		replies: [],
		reactions: [],
	};
	await tx.execute(
		sql`INSERT INTO review_threads (id, pr_id, revision_id, document, updated_at) VALUES (${thread.id}, ${pr.id}, ${thread.revisionId}, ${JSON.stringify(thread)}::jsonb, ${at})`,
	);
	await changed(ctx, tx, pr.id);
	return thread;
}
export async function list(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { pr: string; all: boolean; offset: number; limit: number },
) {
	const pr = await findPr(tx, input.pr);
	if (!pr) return { items: [], total: 0, open: 0 };
	const [counts] = await rows<{ total: number; open: number }>(
		tx,
		sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE document->>'status' = 'open')::int AS open FROM review_threads WHERE pr_id = ${pr.id}`,
	);
	const found = await rows<{ document: ReviewThread }>(
		tx,
		sql`SELECT document FROM review_threads WHERE pr_id = ${pr.id} AND (${input.all} OR document->>'status' = 'open') ORDER BY updated_at, id LIMIT ${input.limit} OFFSET ${input.offset}`,
	);
	return { items: found.map((r) => r.document), ...counts! };
}
export const thread = (_ctx: ServiceCtx, tx: Tx, input: { id: string }) => readThread(tx, input.id);
export async function reply(ctx: ServiceCtx, tx: Tx, input: { id: string; body: string }) {
	const doc = await readThread(tx, input.id);
	const at = ctx.now().toISOString();
	doc.replies.push({
		id: ulid(),
		author: ctx.actor.name,
		kind: ctx.actor.kind,
		session: ctx.session,
		body: input.body,
		createdAt: at,
		updatedAt: at,
		version: 1,
		reactions: [],
	});
	doc.updatedAt = at;
	await writeThread(tx, doc);
	await changed(ctx, tx, doc.prId);
	return doc;
}
export async function resolve(ctx: ServiceCtx, tx: Tx, input: { id: string; resolved: boolean }) {
	const doc = await readThread(tx, input.id);
	doc.status = input.resolved ? "resolved" : "open";
	doc.resolvedAt = input.resolved ? ctx.now().toISOString() : null;
	doc.resolvedBy = input.resolved ? ctx.actor.name : null;
	doc.updatedAt = ctx.now().toISOString();
	await writeThread(tx, doc);
	await changed(ctx, tx, doc.prId);
	return doc;
}
