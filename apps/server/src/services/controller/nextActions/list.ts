import type { ManagerNextAction } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { columns } from "./queries.ts";

export const list = (
	_ctx: Pick<RequestContext, "now">,
	tx: Tx,
	input: { projectId?: string; before?: string; state?: string },
) =>
	rows<ManagerNextAction>(
		tx,
		sql`SELECT ${columns} FROM manager_next_actions
 WHERE ${input.projectId ? sql`project_id=${input.projectId}` : sql`true`}
 AND ${input.state ? sql`state=${input.state}` : sql`true`}
 AND ${input.before ? sql`id<${input.before}` : sql`true`} ORDER BY id DESC LIMIT 100`,
	);
