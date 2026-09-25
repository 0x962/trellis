import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const displayNames = async (
	tx: Tx,
	actors: readonly Pick<ActorRef, "kind" | "name">[],
): Promise<Record<string, string>> => {
	const ids = [...new Set(actors.filter(({ kind }) => kind === "agent").map(({ name }) => name))];
	if (ids.length === 0) return {};
	const found = await rows<{ id: string; name: string }>(
		tx,
		sql`SELECT id, name FROM agent_runs WHERE id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)})`,
	);
	return Object.fromEntries(found.map(({ id, name }) => [id, name]));
};
