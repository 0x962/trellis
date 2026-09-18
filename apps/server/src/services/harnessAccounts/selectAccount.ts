import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { executionEnvironment } from "../../executionEnvironment";
import type { ProjectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { resolveHostDefault } from "./hostDefault.ts";
import { type AccountRow, accountColumns, getAccount } from "./queries.ts";

// The account a new run uses. An explicit account wins. Otherwise the
// default of the harness applies, the way hostDefault.ts resolves it. A
// default that names no Trellis account leaves the run without an account;
// the launch then applies the pointer directory itself.
export async function selectAccount(
	tx: Tx,
	input: { accountId?: string | null; config: ProjectLaunchConfig; useDefault: boolean },
	deps = { env: () => executionEnvironment() },
) {
	const defaultChoice = async () => {
		const preset = input.config.harness.preset;
		if (preset === "custom") return [];
		const accounts = await rows<AccountRow>(
			tx,
			sql`SELECT ${accountColumns} FROM harness_accounts WHERE harness=${preset} AND archived_at IS NULL`,
		);
		const resolved = await resolveHostDefault(preset, accounts, await deps.env());
		return resolved.account ? [{ id: resolved.account.id }] : [];
	};
	const [choice] = input.accountId ? [{ id: input.accountId }] : input.useDefault ? await defaultChoice() : [];
	if (!choice) return { accountId: null, config: input.config };
	const account = await getAccount(tx, choice);
	const harness =
		account.harness === input.config.harness.preset
			? input.config.harness
			: HarnessSchema.parse({ preset: account.harness });
	return { accountId: account.id, config: { ...input.config, harness } };
}
