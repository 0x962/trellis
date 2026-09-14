import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx.ts";
import { readAgentSettings } from "../services/agentSettings.ts";
import { inspect } from "./inspect.ts";
export const prepare = async (tx: Tx, now: Date) => {
	const inventory = await inspect(tx);
	if (inventory.blockers.length > 0) throw new Error(inventory.blockers.join(" "));
	const agents = await readAgentSettings(tx);
	await tx.execute(
		sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents',${JSON.stringify({ ...agents, enabled: false })}::jsonb,${now}),('nativeWorkPaused','true'::jsonb,${now}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
	);
	await tx.execute(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true,"trustedDirectory":false}'::jsonb`,
	);
	return inventory;
};
