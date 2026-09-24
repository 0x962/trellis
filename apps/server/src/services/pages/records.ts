import { createHash } from "node:crypto";
import {
	ActorHeaderSchema,
	PageDeleteInputSchema,
	type PageDetail,
	PageGetInputSchema,
	PageListInputSchema,
	type PageListOutput,
	PagePinInputSchema,
	PageRefSchema,
	PageRestoreInputSchema,
	type PageSummary,
	PageUpdateInputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { decodeCursor, encodeCursor, isIsoTimestamp, iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, resolveProject } from "../refs.ts";
import { PAGE_RETENTION_MS, pageSelect, pinOf, type RawPage, type RawVersion, toSummary, toVersion } from "./rows.ts";

const pageByWhere = async (ctx: ServiceCtx, tx: Tx, where: SQL, includeDeleted: boolean, lock: boolean) => {
	const [row] = await rows<RawPage>(
		tx,
		sql`${pageSelect(ctx)} WHERE ${where} AND ${includeDeleted ? sql`true` : sql`p.deleted_at IS NULL`}
			${lock ? sql`FOR UPDATE OF p` : sql``}`,
	);
	return row;
};

const resolve = async (ctx: ServiceCtx, tx: Tx, ref: string, includeDeleted: boolean, lock: boolean) => {
	const parsed = PageRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "page", ref });
	const where =
		parsed.data.kind === "ulid"
			? sql`p.id = ${parsed.data.id}`
			: sql`project.key = ${parsed.data.key} AND p.slug = ${parsed.data.slug}`;
	const row = await pageByWhere(ctx, tx, where, includeDeleted, lock);
	if (row === undefined) throw fail("NOT_FOUND", { kind: "page", ref: PageRefSchema.canonicalize(ref) });
	return row;
};

export const resolvePage = (ctx: ServiceCtx, tx: Tx, ref: string, includeDeleted = false) =>
	resolve(ctx, tx, ref, includeDeleted, false);

const lockPage = (ctx: ServiceCtx, tx: Tx, ref: string, includeDeleted = false) =>
	resolve(ctx, tx, ref, includeDeleted, true);

const byId = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const row = await pageByWhere(ctx, tx, sql`p.id = ${id}`, true, false);
	if (row === undefined) throw fail("NOT_FOUND", { kind: "page", ref: id });
	return row;
};

type PageCursor = { v: 1; h: string; p: 0 | 1; r: number; at: string; id: string };
const cursorHash = (ctx: ServiceCtx, projectId: string, input: ReturnType<typeof PageListInputSchema.parse>) =>
	createHash("sha1")
		.update(
			JSON.stringify([
				projectId,
				ctx.actor === null ? null : [ctx.actor.kind, ctx.actor.name],
				input.q,
				input.author,
				input.watcher,
				input.comment,
				input.pinned,
			]),
		)
		.digest("hex");

const readCursor = (value: string, hash: string): PageCursor => {
	let parsed: unknown;
	try {
		parsed = decodeCursor(value);
	} catch {
		throw fail("INVALID_CURSOR");
	}
	const cursor = parsed as Partial<PageCursor> | null;
	if (
		cursor === null ||
		cursor.v !== 1 ||
		cursor.h !== hash ||
		(cursor.p !== 0 && cursor.p !== 1) ||
		typeof cursor.r !== "number" ||
		!Number.isInteger(cursor.r) ||
		cursor.r < 0 ||
		cursor.r > 3 ||
		!isIsoTimestamp(cursor.at) ||
		typeof cursor.id !== "string"
	)
		throw fail("INVALID_CURSOR");
	return cursor as PageCursor;
};

const likePattern = (value: string) =>
	`%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageListOutput> => {
	const input = PageListInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	const pinned = pinOf(ctx);
	const pinRank = sql`CASE WHEN ${pinned} THEN 1 ELSE 0 END`;
	const q = input.q === undefined ? undefined : likePattern(input.q);
	const searchRank =
		q === undefined
			? sql`0::int`
			: sql`CASE
				WHEN p.title ILIKE ${q} ESCAPE '\\' THEN 3
				WHEN p.summary ILIKE ${q} ESCAPE '\\' THEN 2
				WHEN latest.search_text ILIKE ${q} ESCAPE '\\' THEN 1
				ELSE 0
			END`;
	const conditions: SQL[] = [sql`p.project_id = ${project.id}`, sql`p.deleted_at IS NULL`];
	if (q !== undefined) conditions.push(sql`${searchRank} > 0`);
	if (input.author !== undefined) {
		const author = ActorHeaderSchema.parse(input.author);
		conditions.push(sql`latest.actor_name = ${author.name} AND latest.actor_kind = ${author.kind}`);
	}
	if (input.watcher !== undefined) conditions.push(sql`watch.agent_id = ${input.watcher}`);
	if (input.comment === "open")
		conditions.push(
			sql`EXISTS (SELECT 1 FROM page_comment_threads thread WHERE thread.page_id = p.id AND thread.resolved_at IS NULL)`,
		);
	if (input.comment === "none")
		conditions.push(
			sql`NOT EXISTS (SELECT 1 FROM page_comment_threads thread WHERE thread.page_id = p.id AND thread.resolved_at IS NULL)`,
		);
	if (input.pinned !== undefined) conditions.push(sql`${pinned} = ${input.pinned}`);
	const hash = cursorHash(ctx, project.id, input);
	if (input.cursor !== undefined) {
		const cursor = readCursor(input.cursor, hash);
		conditions.push(
			sql`(${pinRank}, ${searchRank}, latest.created_at, p.id) <
				(${cursor.p}::int, ${cursor.r}::int, ${cursor.at}::timestamptz, ${cursor.id})`,
		);
	}
	const found = await rows<RawPage>(
		tx,
		sql`${pageSelect(ctx, searchRank)} WHERE ${sql.join(conditions, sql` AND `)}
			ORDER BY ${pinRank} DESC, ${searchRank} DESC, latest.created_at DESC, p.id DESC LIMIT ${input.limit + 1}`,
	);
	const items = found.slice(0, input.limit);
	const last = items.at(-1);
	return {
		items: items.map(toSummary),
		nextCursor:
			found.length > input.limit && last !== undefined
				? encodeCursor({
						v: 1,
						h: hash,
						p: last.pinned ? 1 : 0,
						r: last.search_rank,
						at: last.published_at,
						id: last.id,
					})
				: null,
	};
};

export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageDetail> => {
	const input = PageGetInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page, input.includeDeleted);
	const number = input.version ?? page.latest_version;
	const [version] = await rows<RawVersion>(
		tx,
		sql`SELECT
		v.page_id, v.number, v.request_id, v.label, v.document_sha256, v.document_size,
		v.source_agent_id, v.source_path, v.actor_name, v.actor_kind,
		${actorDisplayName(sql`v.actor_name`, sql`v.actor_kind`)} AS actor_display_name,
		${iso(sql`v.created_at`)} AS created_at,
		(SELECT count(*)::int FROM page_assets asset WHERE asset.page_id = v.page_id AND asset.version = v.number) AS asset_count,
		(SELECT count(*)::int FROM page_comment_threads thread WHERE thread.page_id = v.page_id AND thread.version = v.number) AS total_thread_count,
		(SELECT count(*)::int FROM page_comment_threads thread WHERE thread.page_id = v.page_id AND thread.version = v.number AND thread.resolved_at IS NOT NULL) AS resolved_thread_count
		FROM page_versions v WHERE v.page_id = ${page.id} AND v.number = ${number}`,
	);
	if (version === undefined) throw fail("NOT_FOUND", { kind: "page version", ref: `${toSummary(page).ref}@${number}` });
	return {
		...toSummary(page),
		requestedVersion: toVersion(version),
		assetCount: version.asset_count,
		totalThreadCount: version.total_thread_count,
		resolvedThreadCount: version.resolved_thread_count,
	};
};

const assertRevision = (page: RawPage, expectedVersion: number | undefined) => {
	if (expectedVersion === undefined) throw invalidInput("expectedVersion", "Send the current Page revision.");
	if (expectedVersion !== page.revision) throw fail("PAGE_VERSION_CONFLICT", { current: toSummary(page) });
};

const assertAgentMayChangeDeletedState = (ctx: ServiceCtx, force: boolean | undefined) => {
	if (requireActor(ctx).kind === "agent" && force !== true)
		throw fail("AGENT_CANNOT_DELETE", undefined, "An agent needs force to delete or restore a page.");
};

export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageSummary> => {
	const input = PageUpdateInputSchema.parse(rawInput);
	const page = await lockPage(ctx, tx, input.page);
	assertProjectActive(ctx, page.project_id);
	assertRevision(page, input.expectedVersion);
	const actor = requireActor(ctx);
	const sets: SQL[] = [];
	if (input.title !== undefined && input.title !== page.title) sets.push(sql`title = ${input.title}`);
	if (input.summary !== undefined && input.summary !== page.summary) sets.push(sql`summary = ${input.summary}`);
	if (sets.length === 0) return toSummary(page);
	await upsert(ctx, tx, actor);
	await tx.execute(sql`UPDATE pages SET ${sql.join(sets, sql`, `)}, version = version + 1,
		actor_name = ${actor.name}, actor_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${page.id}`);
	ctx.emit({ type: "pages.changed", projectId: page.project_id, pageId: page.id });
	return toSummary(await byId(ctx, tx, page.id));
};

export const pin = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PagePinInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page);
	assertProjectActive(ctx, page.project_id);
	const actor = requireActor(ctx);
	let changed: { page_id: string }[];
	if (input.pinned) {
		await upsert(ctx, tx, actor);
		changed = await rows<{ page_id: string }>(
			tx,
			sql`INSERT INTO page_pins (page_id, actor_name, actor_kind, created_at)
				VALUES (${page.id}, ${actor.name}, ${actor.kind}, ${ctx.now})
				ON CONFLICT DO NOTHING RETURNING page_id`,
		);
	} else {
		changed = await rows<{ page_id: string }>(
			tx,
			sql`DELETE FROM page_pins WHERE page_id = ${page.id}
				AND actor_name = ${actor.name} AND actor_kind = ${actor.kind} RETURNING page_id`,
		);
	}
	if (changed.length > 0) ctx.emit({ type: "page-pins.changed", projectId: page.project_id, pageId: page.id, actor });
	return { pageId: page.id, pinned: input.pinned };
};

export const remove = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageSummary> => {
	const input = PageDeleteInputSchema.parse(rawInput);
	assertAgentMayChangeDeletedState(ctx, input.force);
	const page = await lockPage(ctx, tx, input.page, true);
	assertProjectActive(ctx, page.project_id);
	assertRevision(page, input.expectedVersion);
	if (page.deleted_at !== null) return toSummary(page);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const removedWatch = await rows<{ agent_id: string }>(
		tx,
		sql`DELETE FROM page_watches WHERE page_id = ${page.id} RETURNING agent_id`,
	);
	await tx.execute(sql`UPDATE pages SET deleted_at = ${ctx.now}, deleted_actor_name = ${actor.name},
		deleted_actor_kind = ${actor.kind}, actor_name = ${actor.name}, actor_kind = ${actor.kind},
		version = version + 1, updated_at = ${ctx.now} WHERE id = ${page.id}`);
	ctx.emit({ type: "pages.changed", projectId: page.project_id, pageId: page.id });
	if (removedWatch.length > 0) ctx.emit({ type: "page-watches.changed", projectId: page.project_id, pageId: page.id });
	return toSummary(await byId(ctx, tx, page.id));
};

export const restore = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageSummary> => {
	const input = PageRestoreInputSchema.parse(rawInput);
	assertAgentMayChangeDeletedState(ctx, input.force);
	const page = await lockPage(ctx, tx, input.page, true);
	assertProjectActive(ctx, page.project_id);
	if (page.deleted_at !== null && ctx.now.getTime() - Date.parse(page.deleted_at) >= PAGE_RETENTION_MS)
		throw fail("NOT_FOUND", { kind: "page", ref: input.page });
	assertRevision(page, input.expectedVersion);
	if (page.deleted_at === null) return toSummary(page);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	await tx.execute(sql`UPDATE pages SET deleted_at = NULL, deleted_actor_name = NULL, deleted_actor_kind = NULL,
		actor_name = ${actor.name}, actor_kind = ${actor.kind}, version = version + 1, updated_at = ${ctx.now}
		WHERE id = ${page.id}`);
	ctx.emit({ type: "pages.changed", projectId: page.project_id, pageId: page.id });
	return toSummary(await byId(ctx, tx, page.id));
};
