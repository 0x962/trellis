import { userInfo } from "node:os";
import type { Settings, SettingsSetInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// The value of every key the table does not hold. `{brief}` in the template
// stands for the ticket brief the Start-with-agent button inserts.
export const defaults = (): Settings => ({
	startWithAgentTemplate: 'claude "$(trellis brief {brief})"',
	defaultActorName: userInfo().username,
	stalledHours: 24,
});

const KEYS = ["startWithAgentTemplate", "defaultActorName", "stalledHours"] as const satisfies (keyof Settings)[];

// One row per key with a jsonb value; a key the table lacks reads as its
// default.
export const get = async (_ctx: ServiceCtx, tx: Tx): Promise<Settings> => {
	const stored = await rows<{ key: string; value: unknown }>(tx, sql`SELECT key, value FROM settings`);
	const result: Record<string, unknown> = { ...defaults() };
	for (const row of stored) result[row.key] = row.value;
	return result as Settings;
};

// Replaces the three values. Every row takes `updated_at = ctx.now`, also a
// row whose value stays. A settings write is not activity: no activity row,
// no event.
export const set = async (ctx: ServiceCtx, tx: Tx, input: SettingsSetInput): Promise<Settings> => {
	requireActor(ctx);
	for (const key of KEYS) {
		await tx.execute(
			sql`INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(input[key])}::jsonb, ${ctx.now})
				ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
		);
	}
	return { ...input };
};
