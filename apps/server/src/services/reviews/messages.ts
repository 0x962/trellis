import type { ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { fail, invalidInput } from "../../errors";
import type { ServiceCtx } from "../support";
import { notFound } from "../support";
import { changed, writeThread } from "./queries";

async function locate(tx: Tx, id: string) {
	const aliases = await rows<{ id: string }>(tx, sql`SELECT id FROM review_imports WHERE legacy_id = ${id}`);
	if (aliases.length > 1)
		throw invalidInput("id", "The legacy identifier matches several messages. Use a Trellis identifier.");
	id = aliases[0]?.id ?? id;
	const [row] = await rows<{ document: ReviewThread }>(
		tx,
		sql`SELECT document FROM review_threads WHERE id = ${id} OR document->'replies' @> ${JSON.stringify([{ id }])}::jsonb`,
	);
	if (!row) throw notFound("reviewMessage", id);
	const thread = row.document;
	const message = thread.id === id ? thread : thread.replies.find((reply) => reply.id === id)!;
	return { thread, message };
}
export async function edit(ctx: ServiceCtx, tx: Tx, input: { id: string; body: string; expectedVersion: number }) {
	const { thread, message } = await locate(tx, input.id);
	if (message.version !== input.expectedVersion) throw fail("REVIEW_VERSION_CONFLICT");
	message.body = input.body;
	message.version += 1;
	message.updatedAt = ctx.now().toISOString();
	thread.updatedAt = message.updatedAt;
	await writeThread(tx, thread);
	await changed(ctx, tx, thread.prId);
	return thread;
}
export async function reaction(
	ctx: ServiceCtx,
	tx: Tx,
	input: { id: string; reaction: ReviewThread["reactions"][number]["reaction"]; remove: boolean },
) {
	const { thread, message } = await locate(tx, input.id);
	message.reactions = message.reactions.filter(
		(r) => !(r.reaction === input.reaction && r.author === ctx.actor.name && r.kind === ctx.actor.kind),
	);
	if (!input.remove) message.reactions.push({ reaction: input.reaction, author: ctx.actor.name, kind: ctx.actor.kind });
	thread.updatedAt = ctx.now().toISOString();
	await writeThread(tx, thread);
	await changed(ctx, tx, thread.prId);
	return thread;
}
