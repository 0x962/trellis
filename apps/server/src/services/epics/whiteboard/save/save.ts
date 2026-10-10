import { EpicWhiteboardSaveInputSchema, type EpicWhiteboardSaveOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { fail } from "../../../../errors.ts";
import { upsert } from "../../../actors.ts";
import { assertProjectActive } from "../../../refs.ts";
import { resolveEpic } from "../../resolve.ts";
import { readWhiteboard } from "../readWhiteboard";

export async function save(ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicWhiteboardSaveOutput> {
	const input = EpicWhiteboardSaveInputSchema.parse(rawInput);
	const actor = requireActor(ctx);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	await upsert(ctx, tx, actor);
	const snapshot = JSON.stringify(input.snapshot);
	const statement =
		input.expectedRevision === 0
			? sql`INSERT INTO epic_whiteboards (epic_id, snapshot, revision, updated_at)
				VALUES (${epic.id}, ${snapshot}::jsonb, 1, ${ctx.now})
				ON CONFLICT (epic_id) DO NOTHING RETURNING revision`
			: sql`UPDATE epic_whiteboards SET snapshot = ${snapshot}::jsonb,
				revision = revision + 1, updated_at = ${ctx.now}
				WHERE epic_id = ${epic.id} AND revision = ${input.expectedRevision} RETURNING revision`;
	const [saved] = await rows<EpicWhiteboardSaveOutput>(tx, statement);
	if (!saved) {
		const current = await readWhiteboard(tx, { epicId: epic.id });
		throw fail("EPIC_WHITEBOARD_VERSION_CONFLICT", { revision: current.revision });
	}
	ctx.emit({ type: "epic-whiteboard.changed", projectId: epic.project_id, id: epic.id, revision: saved.revision });
	return saved;
}
