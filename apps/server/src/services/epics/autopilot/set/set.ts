import { type EpicAutopilot, EpicAutopilotSetInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { invalidInput } from "../../../../errors.ts";
import { resolveActorId } from "../../../actorIdentity";
import { getAccount } from "../../../harnessAccounts/queries.ts";
import { assertProjectActive, resolveStatus } from "../../../refs.ts";
import { resolveEpic } from "../../resolve.ts";

export async function set(ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicAutopilot> {
	const { epic: ref, autopilot } = EpicAutopilotSetInputSchema.parse(rawInput);
	const actor = requireActor(ctx);
	const epic = await resolveEpic(ctx, tx, ref);
	assertProjectActive(ctx, epic.project_id);
	if (autopilot.enabled) {
		if (epic.canceled_at !== null) throw invalidInput("epic", "A canceled epic cannot start tickets.");
		await resolveStatus(ctx, tx, { projectId: epic.project_id, status: "category:started" });
		if (autopilot.accountId !== null) {
			const account = await getAccount(tx, { id: autopilot.accountId });
			if (account.harness !== autopilot.harness.preset)
				throw invalidInput("accountId", "Select an account for the chosen harness.");
		}
	}
	const actorId = await resolveActorId(ctx, tx, actor);
	await tx.execute(sql`UPDATE epics SET autopilot = ${JSON.stringify(autopilot)}::jsonb,
		actor_id = ${actorId}, actor_kind = ${actor.kind}, actor_name = ${actor.name}, updated_at = ${ctx.now}
		WHERE id = ${epic.id}`);
	ctx.emit({ type: "epics.changed", projectId: epic.project_id, id: epic.id });
	return autopilot;
}
