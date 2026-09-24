import {
	PAGE_DOCUMENT_MAX_BYTES,
	PAGE_VERSION_ASSET_MAX_BYTES,
	PagePublishInputSchema,
	type PagePublishOutput,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, resolveProject } from "../refs.ts";
import { deriveSlug } from "../slug.ts";
import { versionRow } from "./content.ts";
import { lockPage, pageById, resolvePage } from "./pages.ts";
import { type RawPage, toSummary } from "./rows.ts";

type StagedRow = { id: string; sha256: string; size: number; mime: string };

// The version that `requestId` already created. `request_id` is unique over
// every page, so one identifier names one version of one page.
const versionOfRequest = async (tx: Tx, requestId: string) => {
	const [row] = await rows<{ page_id: string; number: number; document_sha256: string }>(
		tx,
		sql`SELECT page_id, number, document_sha256 FROM page_versions WHERE request_id = ${requestId}`,
	);
	return row;
};

// A slug that no other page of this project holds. "Forecast report" gives
// `forecast-report`, and a second page of that title gives `forecast-report-2`.
const freeSlug = async (tx: Tx, projectId: string, base: string) => {
	const found = await rows<{ slug: string }>(
		tx,
		sql`SELECT slug FROM pages WHERE project_id = ${projectId} AND (slug = ${base} OR slug LIKE ${`${base}-%`})`,
	);
	const taken = new Set(found.map((row) => row.slug));
	if (!taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
};

const idList = (ids: string[]) =>
	sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `,
	);

// The staged uploads this publication names, held against another writer
// until the transaction ends. A row of another project, of another actor, or
// past its expiry serves no caller, so each of those reads as absent.
const lockUploads = async (ctx: ServiceCtx, tx: Tx, projectId: string, ids: string[]) => {
	const actor = requireActor(ctx);
	const found = await rows<StagedRow>(
		tx,
		sql`SELECT id, sha256, size, mime FROM page_uploads
			WHERE id IN (${idList(ids)})
			AND project_id = ${projectId} AND actor_name = ${actor.name} AND actor_kind = ${actor.kind}
			AND expires_at > ${ctx.now}
			FOR UPDATE`,
	);
	const byId = new Map(found.map((row) => [row.id, row]));
	for (const id of ids) if (!byId.has(id)) throw fail("NOT_FOUND", { kind: "page upload", ref: id });
	return byId;
};

// The agent run that published this version, or null. An agent acts under
// the identifier of its own run, so the actor name is a run id. A person has
// no run, and a run that the database no longer holds records null.
const sourceAgentId = async (ctx: ServiceCtx, tx: Tx) => {
	const actor = requireActor(ctx);
	if (actor.kind !== "agent") return null;
	const [row] = await rows<{ id: string }>(tx, sql`SELECT id FROM agent_runs WHERE id = ${actor.name}`);
	return row === undefined ? null : row.id;
};

const publishOutput = async (ctx: ServiceCtx, tx: Tx, pageId: string, number: number): Promise<PagePublishOutput> => ({
	page: toSummary(await pageById(ctx, tx, pageId)),
	version: (await versionRow(tx, pageId, number))!,
});

// The upload row of `id`, whatever project or actor staged it. The repeat
// path reads it to compare bytes, and the publication path locks it again
// with the rules of the caller.
const stagedUpload = async (tx: Tx, id: string) => {
	const [row] = await rows<{ sha256: string }>(tx, sql`SELECT sha256 FROM page_uploads WHERE id = ${id}`);
	return row;
};

// The answer to a request identifier the table already holds.
//
// A network retry of one publication sends the same page and the same
// document, and the first call consumed that staged upload, so no upload row
// remains to compare. That retry reads the version the first call created.
//
// A caller that stages other bytes and sends them under the same identifier
// still holds its upload row. Answering with the first version would drop
// those bytes in silence, so this refuses instead. Naming another page under
// that identifier refuses for the same reason.
const repeatOf = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: ReturnType<typeof PagePublishInputSchema.parse>,
	repeated: { page_id: string; number: number; document_sha256: string },
) => {
	const named = input.page === undefined ? undefined : await resolvePage(ctx, tx, input.page);
	const staged = await stagedUpload(tx, input.document);
	if (
		(named !== undefined && named.id !== repeated.page_id) ||
		(staged !== undefined && staged.sha256 !== repeated.document_sha256)
	)
		throw fail("DUPLICATE", { field: "requestId" });
	return publishOutput(ctx, tx, repeated.page_id, repeated.number);
};

// One publication. It creates a page with its first version, or it adds a
// version to the page the caller names. Both paths write the version row,
// the asset rows, and the new page revision in this transaction, so no
// reader sees a page whose newest version holds no content.
export const publish = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PagePublishOutput> => {
	const input = PagePublishInputSchema.parse(rawInput);
	const actor = requireActor(ctx);
	const repeated = await versionOfRequest(tx, input.requestId);
	if (repeated !== undefined) return repeatOf(ctx, tx, input, repeated);

	let page: RawPage | undefined;
	let projectId: string;
	let pageId: string;
	let number: number;
	if (input.page === undefined) {
		const project = await resolveProject(ctx, tx, input.project!);
		assertProjectActive(ctx, project.id);
		projectId = project.id;
		pageId = ulid();
		number = 1;
	} else {
		page = await lockPage(ctx, tx, input.page);
		assertProjectActive(ctx, page.project_id);
		if (input.expectedVersion !== page.revision) throw fail("PAGE_VERSION_CONFLICT", { current: toSummary(page) });
		projectId = page.project_id;
		pageId = page.id;
		number = page.latest_version + 1;
	}

	const uploadIds = [...new Set([input.document, ...input.assets.map((asset) => asset.uploadId)])];
	const staged = await lockUploads(ctx, tx, projectId, uploadIds);
	const document = staged.get(input.document)!;
	if (document.size === 0 || document.size > PAGE_DOCUMENT_MAX_BYTES)
		throw invalidInput("document", `A page document holds 1 to ${PAGE_DOCUMENT_MAX_BYTES} bytes.`);
	const assetBytes = input.assets.reduce((total, asset) => total + staged.get(asset.uploadId)!.size, 0);
	if (assetBytes > PAGE_VERSION_ASSET_MAX_BYTES)
		throw invalidInput("assets", `The assets of one version hold ${PAGE_VERSION_ASSET_MAX_BYTES} bytes at most.`);

	await upsert(ctx, tx, actor);
	if (page === undefined) {
		const slug = await freeSlug(tx, projectId, deriveSlug(input.title!));
		await tx.execute(sql`INSERT INTO pages (
			id, project_id, slug, title, summary, version, latest_version,
			creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at
		) VALUES (
			${pageId}, ${projectId}, ${slug}, ${input.title!}, ${input.summary ?? ""}, 1, 1,
			${actor.name}, ${actor.kind}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now}
		)`);
	}
	// `search_text` takes its column default. `pages.list` ranks a content
	// match from that column, so a search matches a title and a summary until
	// TRL-450 reads the document bytes and fills it. This service has the
	// database alone and cannot open the stored document.
	await tx.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, label, document_sha256, document_size,
		source_agent_id, source_path, actor_name, actor_kind, created_at
	) VALUES (
		${pageId}, ${number}, ${input.requestId}, ${input.label ?? null}, ${document.sha256}, ${document.size},
		${await sourceAgentId(ctx, tx)}, ${input.sourcePath}, ${actor.name}, ${actor.kind}, ${ctx.now}
	)`);
	// One statement for every asset. The server holds one database
	// connection, so each statement of this transaction makes every other
	// request of the host wait.
	if (input.assets.length > 0)
		await tx.execute(
			sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime) VALUES ${sql.join(
				input.assets.map((asset) => {
					const row = staged.get(asset.uploadId)!;
					return sql`(${pageId}, ${number}, ${asset.path}, ${row.sha256}, ${row.size}, ${row.mime})`;
				}),
				sql`, `,
			)}`,
		);
	if (page !== undefined) {
		const summarySet = input.summary === undefined ? sql`` : sql`summary = ${input.summary},`;
		await tx.execute(sql`UPDATE pages SET ${summarySet} latest_version = ${number}, version = version + 1,
			actor_name = ${actor.name}, actor_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${pageId}`);
	}
	// A staged upload becomes the input of one version. The object file stays,
	// because the new version row and its asset rows hold its hash.
	await tx.execute(sql`DELETE FROM page_uploads WHERE id IN (${idList(uploadIds)})`);
	ctx.emit({ type: "pages.changed", projectId, pageId });
	return publishOutput(ctx, tx, pageId, number);
};
