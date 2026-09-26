import { PageWatchInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { assertWatchable } from "../../agentRuns.ts";
import { assertProjectActive } from "../../refs.ts";
import { lockPage, pageById } from "../pages.ts";
import { toSummary } from "../rows.ts";

export const watch = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageWatchInputSchema.parse(rawInput);
	const actor = requireActor(ctx);
	const page = await lockPage(ctx, tx, input.page);
	assertProjectActive(ctx, page.project_id);
	const [current] = await rows<{ agent_id: string }>(
		tx,
		sql`SELECT agent_id FROM page_watches WHERE page_id = ${page.id}`,
	);
	if (actor.kind !== "human") {
		const publisher = await rows(
			tx,
			sql`SELECT 1 FROM page_versions WHERE page_id = ${page.id} AND source_agent_id = ${actor.name} LIMIT 1`,
		);
		if (
			actor.kind !== "agent" ||
			publisher.length === 0 ||
			(input.agentId !== null && input.agentId !== actor.name) ||
			(current !== undefined && current.agent_id !== actor.name)
		)
			throw invalidInput("agentId", "Only a person or the publishing agent can change this watcher.");
	}
	if (input.agentId === null) {
		await tx.execute(sql`DELETE FROM page_watches WHERE page_id = ${page.id}`);
	} else {
		await assertWatchable(ctx, tx, { id: input.agentId, projectId: page.project_id });
		if (current?.agent_id === input.agentId) return toSummary(page);
		await tx.execute(sql`INSERT INTO page_watches (page_id, agent_id, created_at, updated_at)
			VALUES (${page.id}, ${input.agentId}, ${ctx.now}, ${ctx.now})
			ON CONFLICT (page_id) DO UPDATE SET agent_id = excluded.agent_id, updated_at = excluded.updated_at,
			reservation_id = NULL, reservation_payload = NULL, reservation_expires_at = NULL,
			reservation_end_at = NULL, reservation_end_id = NULL`);
	}
	ctx.emit({ type: "page-watches.changed", projectId: page.project_id, pageId: page.id });
	return toSummary(await pageById(ctx, tx, page.id));
};
