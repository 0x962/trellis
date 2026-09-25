import { PageCommentCreateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { fail, invalidInput } from "../../../../errors.ts";
import { upsert } from "../../../actors.ts";
import { lockPage } from "../../pages.ts";
import { assertPageCommentWritable, emitCommentsChanged, pageCommentThreadById } from "../support";

export const createPageComment = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentCreateInputSchema.parse(rawInput);
	const page = await lockPage(ctx, tx, input.page, true);
	assertPageCommentWritable(ctx, { project_id: page.project_id, deleted_at: page.deleted_at });
	const version = await rows<{ number: number }>(
		tx,
		sql`SELECT number FROM page_versions WHERE page_id = ${page.id} AND number = ${input.version}`,
	);
	if (version.length === 0) throw fail("NOT_FOUND", { kind: "page version", ref: `${input.page}@${input.version}` });
	if (input.version !== page.latest_version) throw invalidInput("version", "Comment on the latest Page version.");
	const actor = requireActor(ctx);
	const id = ulid();
	await upsert(ctx, tx, actor);
	await tx.execute(sql`INSERT INTO page_comment_threads (
		id, page_id, version, anchor_kind, anchor, selected_text,
		actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${id}, ${page.id}, ${input.version}, ${input.anchor.kind}, ${input.anchor},
		${input.anchor.kind === "text" ? input.anchor.quote : null},
		${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now}
	)`);
	await tx.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_name, actor_kind, created_at, updated_at
	) VALUES (${ulid()}, ${id}, ${input.body}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`);
	emitCommentsChanged(ctx, { project_id: page.project_id, page_id: page.id, version: input.version });
	return pageCommentThreadById(tx, id);
};
