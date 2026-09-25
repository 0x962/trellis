import type { PageSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { Parser } from "htmlparser2";
import type { ServiceCtx } from "../../context.ts";
import { tsquery } from "../../db/queries/fts.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { pageSelect, type RawPage, toSummary } from "./rows.ts";

export const PAGE_SEARCH_TEXT_MAX_BYTES = 1024 * 1024;

const hiddenTags = new Set(["head", "script", "style", "template", "noscript"]);

const truncateUtf8 = (value: string, maxBytes: number) => {
	const bytes = new TextEncoder().encode(value);
	if (bytes.length <= maxBytes) return value;
	let end = maxBytes;
	while ((bytes[end]! & 0xc0) === 0x80) end--;
	return new TextDecoder().decode(bytes.subarray(0, end));
};

export const staticPageText = (html: string): string => {
	const text: string[] = [];
	const hidden: boolean[] = [];
	let hiddenDepth = 0;
	const parser = new Parser(
		{
			onopentag(name, attributes) {
				const elementIsHidden = hiddenDepth > 0 || hiddenTags.has(name) || Object.hasOwn(attributes, "hidden");
				hidden.push(elementIsHidden);
				if (elementIsHidden) hiddenDepth++;
			},
			ontext(value) {
				if (hiddenDepth === 0) text.push(value);
			},
			onclosetag() {
				if (hidden.pop()) hiddenDepth--;
			},
		},
		{ decodeEntities: true },
	);
	parser.end(html);
	return truncateUtf8(text.join(" ").replace(/\s+/gu, " ").trim(), PAGE_SEARCH_TEXT_MAX_BYTES);
};

export type PageSearchInput = {
	q: string;
	projectIds?: readonly string[];
	rankProjectIds?: readonly string[];
	limit: number;
};

const scopeOf = (ids: SQL | undefined) => (ids === undefined ? sql`true` : sql`p.project_id = ANY(${ids})`);

export const searchPages = async (ctx: ServiceCtx, tx: Tx, input: PageSearchInput): Promise<PageSummary[]> => {
	const q = input.q.trim();
	if (q === "") return [];
	const query = tsquery(q);
	const title = sql`to_tsvector('english', p.title)`;
	const summary = sql`to_tsvector('english', p.summary)`;
	const content = sql`to_tsvector('english', latest.search_text)`;
	const combined = sql`(${title} || ${summary} || ${content})`;
	const rank = sql`CASE WHEN ${title} @@ query.ts THEN 3 WHEN ${summary} @@ query.ts THEN 2 ELSE 1 END`;
	const projectIds = input.projectIds === undefined ? undefined : textArray(input.projectIds);
	const rankProjectIds = input.rankProjectIds === undefined ? undefined : textArray(input.rankProjectIds);
	const projectOrder =
		rankProjectIds === undefined ? sql`` : sql`CASE WHEN p.project_id = ANY(${rankProjectIds}) THEN 0 ELSE 1 END,`;
	const found = await rows<RawPage>(
		tx,
		sql`WITH query AS (SELECT ${query} AS ts)
			${pageSelect(ctx, rank)} CROSS JOIN query
			WHERE p.deleted_at IS NULL AND ${scopeOf(projectIds)} AND ${combined} @@ query.ts
			ORDER BY ${projectOrder} ${rank} DESC, ts_rank(${combined}, query.ts) DESC,
				latest.created_at DESC, p.id DESC
			LIMIT ${input.limit}`,
	);
	return found.map(toSummary);
};
