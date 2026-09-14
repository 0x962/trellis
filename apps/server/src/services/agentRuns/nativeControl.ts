import { sql } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";

export const readNativeWork = async (tx: Tx) => {
	const [row] = await rows<{ value: boolean }>(tx, sql`SELECT value FROM settings WHERE key = 'nativeWorkPaused'`);
	return { paused: row?.value === true };
};

export const assertNativeWorkEnabled = async (tx: Tx) => {
	if ((await readNativeWork(tx)).paused)
		throw invalidInput("runtime", "Local work is paused. Resume local work in the desktop app before another start.");
};

export const setNativeWork = async (ctx: Pick<RequestContext, "actor" | "now">, tx: Tx, input: { paused: boolean }) => {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must change the local work setting.");
	await tx.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES ('nativeWorkPaused', ${JSON.stringify(input.paused)}::jsonb, ${ctx.now}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
	);
	return input;
};
