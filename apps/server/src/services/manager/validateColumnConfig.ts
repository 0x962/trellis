import type { StatusAgentConfig, StatusCategory } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";

export async function validateColumnConfig(
	tx: Tx,
	category: StatusCategory,
	config: StatusAgentConfig | null | undefined,
) {
	if (!config) return;
	if (category === "done" || category === "canceled")
		throw invalidInput("agentConfig", "A terminal status cannot start a worker.");
	const [persona] = await rows<{ kind: string }>(tx, sql`SELECT kind FROM personas WHERE id=${config.personaId}`);
	if (!persona || persona.kind === "manager")
		throw invalidInput("agentConfig.personaId", "Select a builder or reviewer persona for this column.");
	if (config.accountId) {
		const [account] = await rows<{ harness: string; enabled: boolean }>(
			tx,
			sql`SELECT harness,enabled FROM harness_accounts WHERE id=${config.accountId} AND archived_at IS NULL`,
		);
		if (!account?.enabled || account.harness !== config.harness.preset)
			throw invalidInput("agentConfig.accountId", "Select an enabled account for this harness.");
	}
}
