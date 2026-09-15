import { type SQL, sql } from "drizzle-orm";

export const actorDisplayName = (name: SQL, kind: SQL) =>
	sql`(SELECT r.persona_name FROM agent_runs r WHERE ${kind} = 'agent' AND r.id = ${name})`;
