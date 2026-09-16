import { HarnessSchema, type ProjectManagerConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getAccount } from "./queries.ts";

export async function selectAccount(
	tx: Tx,
	input: { accountId?: string | null; config: ProjectManagerConfig; useDefault: boolean },
) {
	const [choice] = input.accountId
		? [{ id: input.accountId }]
		: input.useDefault
			? await rows<{ id: string }>(
					tx,
					sql`SELECT id FROM harness_accounts WHERE harness=${input.config.harness.preset} AND is_default AND archived_at IS NULL`,
				)
			: [];
	if (!choice) return { accountId: null, config: input.config };
	const account = await getAccount(tx, choice);
	if (!account.enabled) throw invalidInput("accountId", "This account is disabled. Select an enabled account.");
	const harness =
		account.harness === input.config.harness.preset
			? input.config.harness
			: HarnessSchema.parse({ preset: account.harness });
	return { accountId: account.id, config: { ...input.config, harness } };
}
