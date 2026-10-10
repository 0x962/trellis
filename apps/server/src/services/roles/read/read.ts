import type { Role } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";

export const roleSelect = sql`SELECT id, name, body, ${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt" FROM roles`;
export async function read(tx: Tx, id: string): Promise<Role> {
	const [role] = await rows<Role>(tx, sql`${roleSelect} WHERE id = ${id}`);
	if (role === undefined) throw fail("NOT_FOUND", { kind: "role", ref: id });
	return role;
}
