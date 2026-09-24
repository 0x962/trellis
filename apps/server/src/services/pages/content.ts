import {
	type PageAsset,
	type PageContentFile,
	PageContentInputSchema,
	type PagePullContent,
	PagePullInputSchema,
	type PageVersion,
	PageVersionListInputSchema,
	type PageVersionListOutput,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { decodeCursor, encodeCursor, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { resolvePage } from "./pages.ts";
import { type RawVersion, toSummary, toVersion, versionColumns } from "./rows.ts";

// Every page serves its document under the name `index.html`, so the content
// route answers the root of a render lease and that one name with the
// document itself.
const DOCUMENT_MIME = "text/html; charset=utf-8";

export const versionRow = async (tx: Tx, pageId: string, number: number): Promise<PageVersion | undefined> => {
	const [row] = await rows<RawVersion>(
		tx,
		sql`SELECT ${versionColumns} FROM page_versions v WHERE v.page_id = ${pageId} AND v.number = ${number}`,
	);
	return row === undefined ? undefined : toVersion(row);
};

type DeletedRow = { deleted_at: string | null };

// The file at one address of one page version. The render lease holds the
// page and the version, and `path` is the rest of the address the browser
// asked for. A page that a person deleted answers `deleted`, and the route
// turns that into HTTP 410.
export const content = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageContentFile> => {
	const input = PageContentInputSchema.parse(rawInput);
	const [page] = await rows<DeletedRow>(tx, sql`SELECT deleted_at FROM pages WHERE id = ${input.pageId}`);
	if (page === undefined) return { state: "missing" };
	if (page.deleted_at !== null) return { state: "deleted" };
	if (input.path === undefined) {
		const [version] = await rows<{ document_sha256: string; document_size: number }>(
			tx,
			sql`SELECT document_sha256, document_size FROM page_versions
				WHERE page_id = ${input.pageId} AND number = ${input.version}`,
		);
		if (version === undefined) return { state: "missing" };
		return { state: "ok", sha256: version.document_sha256, size: version.document_size, mime: DOCUMENT_MIME };
	}
	const [asset] = await rows<{ sha256: string; size: number; mime: string }>(
		tx,
		sql`SELECT sha256, size, mime FROM page_assets
			WHERE page_id = ${input.pageId} AND version = ${input.version} AND path = ${input.path}`,
	);
	if (asset === undefined) return { state: "missing" };
	return { state: "ok", sha256: asset.sha256, size: asset.size, mime: asset.mime };
};

type VersionCursor = { format: 1; pageId: string; number: number };

const readCursor = (value: string, pageId: string): VersionCursor => {
	let parsed: unknown;
	try {
		parsed = decodeCursor(value);
	} catch {
		throw fail("INVALID_CURSOR");
	}
	const cursor = parsed as Partial<VersionCursor> | null;
	if (
		cursor === null ||
		cursor.format !== 1 ||
		cursor.pageId !== pageId ||
		typeof cursor.number !== "number" ||
		!Number.isInteger(cursor.number)
	)
		throw fail("INVALID_CURSOR");
	return cursor as VersionCursor;
};

export const versions = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PageVersionListOutput> => {
	const input = PageVersionListInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page);
	const before = input.cursor === undefined ? sql`true` : sql`v.number < ${readCursor(input.cursor, page.id).number}`;
	const found = await rows<RawVersion>(
		tx,
		sql`SELECT ${versionColumns} FROM page_versions v WHERE v.page_id = ${page.id} AND ${before}
			ORDER BY v.number DESC LIMIT ${input.limit + 1}`,
	);
	const items = found.slice(0, input.limit);
	const last = items.at(-1);
	return {
		items: items.map(toVersion),
		nextCursor:
			found.length > input.limit && last !== undefined
				? encodeCursor({ format: 1, pageId: page.id, number: last.number })
				: null,
	};
};

export const assetsOf = async (tx: Tx, pageId: string, version: number): Promise<PageAsset[]> => {
	const found = await rows<{ path: string; sha256: string; size: number; mime: string }>(
		tx,
		sql`SELECT path, sha256, size, mime FROM page_assets
			WHERE page_id = ${pageId} AND version = ${version} ORDER BY path`,
	);
	return found.map((row) => ({ pageId, version, ...row }));
};

// One page version with every file it holds. The caller writes the document
// as `index.html` and each asset at its own path.
export const pull = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PagePullContent> => {
	const input = PagePullInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page);
	const summary = toSummary(page);
	const number = input.version ?? page.latest_version;
	const version = await versionRow(tx, page.id, number);
	if (version === undefined) throw fail("NOT_FOUND", { kind: "page version", ref: `${summary.ref}@${number}` });
	return { page: summary, version, assets: await assetsOf(tx, page.id, number) };
};
