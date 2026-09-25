import type { ActorRef, PageCommentAnchor, PageCommentThread } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context.ts";
import { iso, rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { fail } from "../../../../errors.ts";
import { displayNames } from "../../../agentRuns/displayNames";
import { assertProjectActive } from "../../../refs.ts";

type CommentRow = {
	thread_id: string;
	page_id: string;
	version: number;
	anchor: PageCommentAnchor;
	selected_text: string | null;
	creator_name: string;
	creator_kind: ActorRef["kind"];
	resolved_at: string | null;
	resolved_by_name: string | null;
	resolved_by_kind: ActorRef["kind"] | null;
	thread_created_at: string;
	thread_updated_at: string;
	comment_id: string;
	body: string;
	comment_actor_name: string;
	comment_actor_kind: ActorRef["kind"];
	comment_created_at: string;
	comment_updated_at: string;
	comment_deleted_at: string | null;
};

export type PageCommentThreadRow = {
	id: string;
	page_id: string;
	version: number;
	project_id: string;
	deleted_at: string | null;
};

export type PageCommentOwnerRow = PageCommentThreadRow & {
	comment_id: string;
	actor_name: string;
	actor_kind: ActorRef["kind"];
};

const actorOf = (name: string, kind: ActorRef["kind"], agentDisplayNames: Record<string, string>): ActorRef => ({
	name,
	kind,
	...(kind === "agent" && agentDisplayNames[name] !== undefined ? { displayName: agentDisplayNames[name] } : {}),
});

const selectCommentRows = (tx: Tx, where: SQL) =>
	rows<CommentRow>(
		tx,
		sql`SELECT thread.id AS thread_id, thread.page_id, thread.version, thread.anchor, thread.selected_text,
			thread.actor_name AS creator_name, thread.actor_kind AS creator_kind,
			${iso(sql`thread.resolved_at`)} AS resolved_at, thread.resolved_by_name, thread.resolved_by_kind,
			${iso(sql`thread.created_at`)} AS thread_created_at,
			${iso(sql`thread.updated_at`)} AS thread_updated_at,
			comment.id AS comment_id, comment.body, comment.actor_name AS comment_actor_name,
			comment.actor_kind AS comment_actor_kind,
			${iso(sql`comment.created_at`)} AS comment_created_at,
			${iso(sql`comment.updated_at`)} AS comment_updated_at,
			${iso(sql`comment.deleted_at`)} AS comment_deleted_at
			FROM page_comment_threads thread
			JOIN page_comments comment ON comment.thread_id = thread.id
			WHERE ${where}
			ORDER BY thread.created_at, thread.id, comment.created_at, comment.id`,
	);

const toThreads = (joinedRows: CommentRow[], agentDisplayNames: Record<string, string>): PageCommentThread[] => {
	const threads = new Map<string, PageCommentThread>();
	for (const row of joinedRows) {
		const comment = {
			id: row.comment_id,
			threadId: row.thread_id,
			body: row.body,
			actor: actorOf(row.comment_actor_name, row.comment_actor_kind, agentDisplayNames),
			createdAt: row.comment_created_at,
			updatedAt: row.comment_updated_at,
			deletedAt: row.comment_deleted_at,
		};
		const thread = threads.get(row.thread_id);
		if (thread !== undefined) {
			thread.comments.push(comment);
			continue;
		}
		threads.set(row.thread_id, {
			id: row.thread_id,
			pageId: row.page_id,
			version: row.version,
			anchor: row.anchor,
			selectedText: row.selected_text,
			creator: actorOf(row.creator_name, row.creator_kind, agentDisplayNames),
			resolved:
				row.resolved_at === null
					? null
					: {
							actor: actorOf(row.resolved_by_name!, row.resolved_by_kind!, agentDisplayNames),
							at: row.resolved_at,
						},
			comments: [comment],
			createdAt: row.thread_created_at,
			updatedAt: row.thread_updated_at,
		});
	}
	return [...threads.values()];
};

export const loadPageCommentThreads = async (tx: Tx, where: SQL) => {
	const joinedRows = await selectCommentRows(tx, where);
	const agentDisplayNames = await displayNames(
		tx,
		joinedRows.flatMap((row) => [
			{ name: row.creator_name, kind: row.creator_kind },
			...(row.resolved_by_name === null || row.resolved_by_kind === null
				? []
				: [{ name: row.resolved_by_name, kind: row.resolved_by_kind }]),
			{ name: row.comment_actor_name, kind: row.comment_actor_kind },
		]),
	);
	return toThreads(joinedRows, agentDisplayNames);
};

export const pageCommentThreadById = async (tx: Tx, id: string) => {
	const [thread] = await loadPageCommentThreads(tx, sql`thread.id = ${id}`);
	if (thread === undefined) throw fail("NOT_FOUND", { kind: "page comment thread", ref: id });
	return thread;
};

export const findPageCommentThread = async (tx: Tx, id: string) => {
	const [thread] = await rows<PageCommentThreadRow>(
		tx,
		sql`SELECT thread.id, thread.page_id, thread.version, page.project_id,
			${iso(sql`page.deleted_at`)} AS deleted_at
			FROM page_comment_threads thread
			JOIN pages page ON page.id = thread.page_id
			WHERE thread.id = ${id}
			FOR UPDATE OF page`,
	);
	if (thread === undefined) throw fail("NOT_FOUND", { kind: "page comment thread", ref: id });
	return thread;
};

export const findPageComment = async (tx: Tx, id: string) => {
	const [comment] = await rows<PageCommentOwnerRow>(
		tx,
		sql`SELECT comment.id AS comment_id, comment.actor_name, comment.actor_kind,
			thread.id, thread.page_id, thread.version, page.project_id,
			${iso(sql`page.deleted_at`)} AS deleted_at
			FROM page_comments comment
			JOIN page_comment_threads thread ON thread.id = comment.thread_id
			JOIN pages page ON page.id = thread.page_id
			WHERE comment.id = ${id} AND comment.deleted_at IS NULL
			FOR UPDATE OF page`,
	);
	if (comment === undefined) throw fail("NOT_FOUND", { kind: "page comment", ref: id });
	return comment;
};

export const assertPageCommentWritable = (
	ctx: ServiceCtx,
	row: Pick<PageCommentThreadRow, "project_id" | "deleted_at">,
) => {
	assertProjectActive(ctx, row.project_id);
	if (row.deleted_at !== null) throw fail("PAGE_DELETED");
};

export const emitCommentsChanged = (
	ctx: ServiceCtx,
	row: Pick<PageCommentThreadRow, "project_id" | "page_id" | "version">,
) => ctx.emit({ type: "page-comments.changed", projectId: row.project_id, pageId: row.page_id, version: row.version });
