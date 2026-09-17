import type { ManagerNextAction } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { notFound } from "../../support.ts";
import { assertOwner, columns } from "./queries.ts";

export const cancel = async (ctx: Pick<RequestContext, "actor">, tx: Tx, input: { id: string }) => {
	const [action] = await rows<ManagerNextAction>(
		tx,
		sql`SELECT ${columns} FROM manager_next_actions WHERE id=${input.id}`,
	);
	if (!action) throw notFound("managerAction", input.id);
	await assertOwner(ctx, tx, action.projectId);
	await tx.execute(
		sql`UPDATE manager_next_actions SET state='canceled',eligible_at=NULL WHERE id=${input.id} AND state='waiting'`,
	);
	return (await rows<ManagerNextAction>(tx, sql`SELECT ${columns} FROM manager_next_actions WHERE id=${input.id}`))[0]!;
};
