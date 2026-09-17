import type { HarnessAccount } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

export type AccountRow = Omit<HarnessAccount, "loginCommand" | "capabilities">;
export const accountColumns = sql`id,name,harness,profile_path AS "profilePath",is_default AS "isDefault",enabled,${iso(sql`created_at`)} AS "createdAt",${iso(sql`updated_at`)} AS "updatedAt"`;
export const getAccount = async (tx: Tx, input: { id: string }) => {
	const [account] = await rows<AccountRow>(
		tx,
		sql`SELECT ${accountColumns} FROM harness_accounts WHERE id=${input.id} AND archived_at IS NULL`,
	);
	if (!account) throw fail("NOT_FOUND", { kind: "harness account", ref: input.id });
	return account;
};
