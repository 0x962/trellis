import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context.ts";
import { createCache } from "../../../cache.ts";
import { openDb } from "../../../client.ts";

export const actorIdentityFixture = async () => {
	const db = await openDb(":memory:");
	await db.execute(sql`CREATE TABLE actors (
		id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		name text NOT NULL,
		kind text NOT NULL,
		first_seen_at timestamptz(3) NOT NULL,
		last_seen_at timestamptz(3) NOT NULL,
		CONSTRAINT actors_name_check CHECK (name ~ '^[ -~]+$' AND position(':' IN name) = 0),
		CONSTRAINT actors_kind_check CHECK (kind IN ('human', 'agent', 'system'))
	)`);
	await db.execute(
		sql`ALTER TABLE actors ADD CONSTRAINT actors_identity_equality
			EXCLUDE USING hash ((ARRAY[kind, name]) WITH =)`,
	);
	const actorCache = new Map<string, number>();
	const context = (now: Date): ServiceCtx => ({
		actor: { kind: "human", name: "test" },
		session: null,
		reqId: crypto.randomUUID(),
		now,
		emit: () => {},
		cache: createCache(),
		actorCache,
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	});
	return { db, context };
};
