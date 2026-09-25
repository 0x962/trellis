import { InternalLinkResolveInputSchema, type InternalLinkType, parseInternalLink } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

type HrefRow = { href: string };

const missing = (type: InternalLinkType, id: string) =>
	fail("NOT_FOUND", { kind: type, ref: id }, `This ${type} does not exist or is unavailable.`);

const oneHref = async (tx: Tx, query: SQL, type: InternalLinkType, id: string) => {
	const [row] = await rows<HrefRow>(tx, query);
	if (row === undefined) throw missing(type, id);
	return { href: row.href };
};

export const resolve = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<HrefRow> => {
	const input = InternalLinkResolveInputSchema.parse(rawInput);
	const { type, id } = parseInternalLink(input.link)!;
	if (type === "page") {
		const [page] = await rows<HrefRow & { deleted: boolean }>(
			tx,
			sql`SELECT '/p/' || project.key || '/pages/' || p.slug AS href,
				p.deleted_at IS NOT NULL AS deleted
			FROM pages p JOIN projects project ON project.id = p.project_id WHERE p.id = ${id}`,
		);
		if (page === undefined) throw missing(type, id);
		if (page.deleted) throw fail("PAGE_DELETED");
		return { href: page.href };
	}
	if (type === "pr")
		return oneHref(
			tx,
			sql`SELECT '/reviews/' || owner || '/' || repo || '/' || number AS href
				FROM pull_requests WHERE id = ${id}`,
			type,
			id,
		);
	if (type === "ticket")
		return oneHref(
			tx,
			sql`SELECT '/t/' || project.key || '-' || t.number AS href
				FROM tickets t JOIN projects project ON project.id = t.project_id WHERE t.id = ${id}`,
			type,
			id,
		);
	if (type === "resource")
		return oneHref(
			tx,
			sql`SELECT '/p/' || project.key || '/epics/' || e.slug || '?tab=resources#' || er.id AS href
				FROM epic_resources er
				JOIN epics e ON e.id = er.epic_id
				JOIN projects project ON project.id = e.project_id
				WHERE er.id = ${id}`,
			type,
			id,
		);
	if (type === "epic")
		return oneHref(
			tx,
			sql`SELECT '/p/' || project.key || '/epics/' || e.slug AS href
				FROM epics e JOIN projects project ON project.id = e.project_id WHERE e.id = ${id}`,
			type,
			id,
		);
	return oneHref(tx, sql`SELECT '/sessions/' || id AS href FROM sessions WHERE id = ${id}`, type, id);
};
