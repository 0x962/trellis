import { PagePinInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { findActorId, resolveActorId } from "../../actorIdentity/index.ts";
import { assertProjectActive } from "../../refs.ts";
import { resolvePage } from "../pages.ts";

export const pin = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PagePinInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page);
	assertProjectActive(ctx, page.project_id);
	const actor = requireActor(ctx);
	let changed: { page_id: string }[];
	if (input.pinned) {
		const actorId = await resolveActorId(ctx, tx, actor);
		changed = await rows<{ page_id: string }>(
			tx,
			sql`INSERT INTO page_pins (page_id, actor_id, actor_name, actor_kind, created_at)
				VALUES (${page.id}, ${actorId}, ${actor.name}, ${actor.kind}, ${ctx.now})
				ON CONFLICT DO NOTHING RETURNING page_id`,
		);
	} else {
		const actorId = await findActorId(ctx, tx, actor);
		changed =
			actorId === null
				? []
				: await rows<{ page_id: string }>(
						tx,
						sql`DELETE FROM page_pins WHERE page_id = ${page.id} AND actor_id = ${actorId} RETURNING page_id`,
					);
	}
	if (changed.length > 0) ctx.emit({ type: "page-pins.changed", projectId: page.project_id, pageId: page.id, actor });
	return { pageId: page.id, pinned: input.pinned };
};
