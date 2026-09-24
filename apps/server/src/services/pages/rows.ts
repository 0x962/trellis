import type { ActorRef, PageSummary, PageVersion, PageWatch } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso } from "../../db/queries/support.ts";

export const PAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type RawPage = {
	id: string;
	project_id: string;
	project_key: string;
	slug: string;
	title: string;
	summary: string;
	revision: number;
	latest_version: number;
	creator_actor_name: string;
	creator_actor_kind: ActorRef["kind"];
	creator_display_name: string | null;
	actor_name: string;
	actor_kind: ActorRef["kind"];
	actor_display_name: string | null;
	published_actor_name: string;
	published_actor_kind: ActorRef["kind"];
	published_display_name: string | null;
	published_at: string;
	watch_agent_id: string | null;
	watch_agent_name: string | null;
	watch_created_at: string | null;
	watch_updated_at: string | null;
	pinned: boolean;
	search_rank: number;
	open_thread_count: number;
	deleted_at: string | null;
	deleted_actor_name: string | null;
	deleted_actor_kind: ActorRef["kind"] | null;
	deleted_display_name: string | null;
	purge_at: string | null;
	created_at: string;
	updated_at: string;
};

export type RawVersion = {
	page_id: string;
	number: number;
	request_id: string;
	label: string | null;
	document_sha256: string;
	document_size: number;
	source_agent_id: string | null;
	source_path: string;
	actor_name: string;
	actor_kind: ActorRef["kind"];
	actor_display_name: string | null;
	created_at: string;
	asset_count: number;
	total_thread_count: number;
	resolved_thread_count: number;
};

const actorOf = (name: string, kind: ActorRef["kind"], displayName: string | null): ActorRef => ({
	name,
	kind,
	...(displayName === null ? {} : { displayName }),
});

export const pinOf = (ctx: ServiceCtx) =>
	ctx.actor === null
		? sql`false`
		: sql`EXISTS (SELECT 1 FROM page_pins pin WHERE pin.page_id = p.id AND pin.actor_name = ${ctx.actor.name} AND pin.actor_kind = ${ctx.actor.kind})`;

export const pageSelect = (ctx: ServiceCtx, searchRank: SQL = sql`0`) => sql`SELECT
	p.id, p.project_id, project.key AS project_key, p.slug, p.title, p.summary,
	p.version AS revision, p.latest_version,
	p.creator_actor_name, p.creator_actor_kind,
	${actorDisplayName(sql`p.creator_actor_name`, sql`p.creator_actor_kind`)} AS creator_display_name,
	p.actor_name, p.actor_kind,
	${actorDisplayName(sql`p.actor_name`, sql`p.actor_kind`)} AS actor_display_name,
	latest.actor_name AS published_actor_name, latest.actor_kind AS published_actor_kind,
	${actorDisplayName(sql`latest.actor_name`, sql`latest.actor_kind`)} AS published_display_name,
	${iso(sql`latest.created_at`)} AS published_at,
	watch.agent_id AS watch_agent_id, watch_agent.name AS watch_agent_name,
	${iso(sql`watch.created_at`)} AS watch_created_at, ${iso(sql`watch.updated_at`)} AS watch_updated_at,
	${pinOf(ctx)} AS pinned,
	${searchRank} AS search_rank,
	(SELECT count(*)::int FROM page_comment_threads thread WHERE thread.page_id = p.id AND thread.resolved_at IS NULL) AS open_thread_count,
	${iso(sql`p.deleted_at`)} AS deleted_at, p.deleted_actor_name, p.deleted_actor_kind,
	${actorDisplayName(sql`p.deleted_actor_name`, sql`p.deleted_actor_kind`)} AS deleted_display_name,
	${iso(sql`(p.deleted_at + ${PAGE_RETENTION_MS} * interval '1 millisecond')`)} AS purge_at,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at
	FROM pages p
	JOIN projects project ON project.id = p.project_id
	JOIN page_versions latest ON latest.page_id = p.id AND latest.number = p.latest_version
	LEFT JOIN page_watches watch ON watch.page_id = p.id
	LEFT JOIN agent_runs watch_agent ON watch_agent.id = watch.agent_id`;

const toWatch = (row: RawPage): PageWatch | null =>
	row.watch_agent_id === null
		? null
		: {
				pageId: row.id,
				agent: { id: row.watch_agent_id, name: row.watch_agent_name! },
				createdAt: row.watch_created_at!,
				updatedAt: row.watch_updated_at!,
			};

export const toSummary = (row: RawPage): PageSummary => ({
	id: row.id,
	projectId: row.project_id,
	projectKey: row.project_key,
	ref: `${row.project_key}/pages/${row.slug}`,
	slug: row.slug,
	title: row.title,
	summary: row.summary,
	revision: row.revision,
	latestVersion: row.latest_version,
	creator: actorOf(row.creator_actor_name, row.creator_actor_kind, row.creator_display_name),
	actor: actorOf(row.actor_name, row.actor_kind, row.actor_display_name),
	publishedBy: actorOf(row.published_actor_name, row.published_actor_kind, row.published_display_name),
	publishedAt: row.published_at,
	watcher: toWatch(row),
	pinned: row.pinned,
	openThreadCount: row.open_thread_count,
	deletedAt: row.deleted_at,
	deletedBy:
		row.deleted_actor_name === null
			? null
			: actorOf(row.deleted_actor_name, row.deleted_actor_kind!, row.deleted_display_name),
	purgeAt: row.purge_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export const toVersion = (row: RawVersion): PageVersion => ({
	pageId: row.page_id,
	number: row.number,
	requestId: row.request_id,
	label: row.label,
	documentSha256: row.document_sha256,
	documentSize: row.document_size,
	sourceAgentId: row.source_agent_id,
	sourcePath: row.source_path,
	actor: actorOf(row.actor_name, row.actor_kind, row.actor_display_name),
	createdAt: row.created_at,
});
