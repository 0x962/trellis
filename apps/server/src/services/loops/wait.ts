import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

const WAIT_SECONDS_KEY = "loopWaitSeconds";

export const DEFAULT_WAIT_SECONDS = 1;

export const readWaitSeconds = async (tx: Tx) => {
	const [setting] = await rows<{ value: number }>(tx, sql`SELECT value FROM settings WHERE key = ${WAIT_SECONDS_KEY}`);
	return setting?.value ?? DEFAULT_WAIT_SECONDS;
};

export const writeWaitSeconds = (tx: Tx, input: { seconds: number; at: Date }) =>
	tx.execute(
		sql`INSERT INTO settings (key, value, updated_at)
			VALUES (${WAIT_SECONDS_KEY}, ${JSON.stringify(input.seconds)}::jsonb, ${input.at})
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
	);
