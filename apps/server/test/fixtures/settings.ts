import { sql } from "drizzle-orm";
import type { Executor } from "./projects.ts";

// One setting is one row: `key` names the setting and `value` holds its JSON.
// A second call for the same key replaces the value.
export const seedSetting = (tx: Executor, key: string, value: unknown) =>
	tx.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
	);
