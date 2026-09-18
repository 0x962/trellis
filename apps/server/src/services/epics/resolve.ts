import { EpicRefSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { assertProjectActive } from "../refs.ts";
import { epicSelect, type RawEpic } from "./rows.ts";

// An epic ref is a ULID or `KEY/slug`, in any letter case.
export const resolveEpic = async (_ctx: ServiceCtx, tx: Tx, ref: string): Promise<RawEpic> => {
	const parsed = EpicRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "epic", ref });
	const canonical = EpicRefSchema.canonicalize(ref);
	const where =
		parsed.data.kind === "ulid"
			? sql`e.id = ${parsed.data.id}`
			: sql`root.key = ${parsed.data.key} AND e.slug = ${parsed.data.slug}`;
	const found = await rows<RawEpic>(tx, sql`${epicSelect} WHERE ${where}`);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "epic", ref: canonical });
	return found[0]!;
};

// The epic a ticket of `rootId` can join. The epic sits in the same root,
// and the project of the epic accepts a mutation. The foreign key on
// `tickets.epic_id` cannot hold the root rule alone, so the service holds it.
export const resolveEpicForTicket = async (ctx: ServiceCtx, tx: Tx, rootId: string, ref: string) => {
	const epic = await resolveEpic(ctx, tx, ref);
	if (epic.root_id !== rootId) throw fail("CROSS_ROOT_MOVE");
	assertProjectActive(ctx, epic.project_id);
	return epic;
};
