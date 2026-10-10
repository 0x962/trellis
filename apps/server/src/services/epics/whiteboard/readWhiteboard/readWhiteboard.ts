import type { EpicWhiteboard } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";

export async function readWhiteboard(tx: Tx, input: { epicId: string }): Promise<EpicWhiteboard> {
	const [board] = await rows<EpicWhiteboard>(
		tx,
		sql`SELECT snapshot, revision FROM epic_whiteboards WHERE epic_id = ${input.epicId}`,
	);
	return board ?? { snapshot: null, revision: 0 };
}
