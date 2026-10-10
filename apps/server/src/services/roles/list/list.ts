import type { Role } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { roleSelect } from "../read";

export async function list(_ctx: ServiceCtx, tx: Tx): Promise<Role[]> {
	return rows<Role>(tx, sql`${roleSelect} ORDER BY lower(name), id`);
}
