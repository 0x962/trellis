import { userInfo } from "node:os";
import type { Settings, SettingsSetInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// A key absent from the settings table uses its default value.
export const defaults = (): Settings => ({
	defaultActorName: userInfo().username,
	menuLinks: [],
});

const KEYS = ["defaultActorName", "notifications", "menuLinks"] as const satisfies (keyof Settings)[];

// One row per key with a jsonb value; a key the table lacks reads as its
// default. The table holds other keys too, such as the agent settings, so
// the read names its own keys.
export const get = async (_ctx: ServiceCtx, tx: Tx): Promise<Settings> => {
	const stored = await rows<{ key: string; value: unknown }>(
		tx,
		sql`SELECT key, value FROM settings WHERE key = ANY(${textArray(KEYS)})`,
	);
	const result: Record<string, unknown> = { ...defaults() };
	for (const row of stored) result[row.key] = row.value;
	return result as Settings;
};

// Omitted optional keys keep their stored values, so older clients preserve newer settings.
export const set = async (ctx: ServiceCtx, tx: Tx, input: SettingsSetInput): Promise<Settings> => {
	requireActor(ctx);
	for (const key of KEYS) {
		if (input[key] === undefined) continue;
		await tx.execute(
			sql`INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(input[key])}::jsonb, ${ctx.now})
				ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
		);
	}
	return get(ctx, tx);
};
