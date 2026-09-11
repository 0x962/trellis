import { userInfo } from "node:os";
import type { Settings, SettingsSetInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// The value of every key the table does not hold. `{brief}` in the agent
// template stands for the ticket brief the Start-with-agent button inserts.
// `{url}` in the diff template stands for the URL of the pull request, so
// the default opens the Files changed tab of that pull request on GitHub.
export const defaults = (): Settings => ({
	startWithAgentTemplate: 'claude "$(trellis brief {brief})"',
	defaultActorName: userInfo().username,
	stalledHours: 24,
	diffUrlTemplate: "{url}/files",
});

const KEYS = [
	"startWithAgentTemplate",
	"defaultActorName",
	"stalledHours",
	"diffUrlTemplate",
] as const satisfies (keyof Settings)[];

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

// Replaces every value. Every row takes `updated_at = ctx.now`, also a
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
