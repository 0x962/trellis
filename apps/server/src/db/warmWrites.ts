import { sql, TransactionRollbackError } from "drizzle-orm";
import { type ServiceCtx, SYSTEM_ACTOR } from "../context.ts";
import * as comments from "../services/comments.ts";
import { chainOf } from "../services/refs.ts";
import * as tickets from "../services/tickets.ts";
import type { ProjectCache } from "./cache.ts";
import type { Db } from "./client.ts";

// The first write after a boot pays for what Postgres loads on first use:
// the catalog entries of the tables, indexes, and foreign keys, and the text
// search dictionary behind the generated search columns. `warmWrites` pays
// it at boot: it runs the writes people make most on one ticket inside one
// transaction, then rolls the transaction back.
//
// The rollback leaves no row and no event. The context gets its own actor
// cache, because an actor row that rolls back must not count as written for
// the next real mutation.

// The tickets the warm-up checks for one in an active project.
const CANDIDATES = 20;

const WARM_TITLE = "Warm up";

type Candidate = { id: string; title: string; project_id: string; status_id: string };

export const warmWrites = async (db: Db, cache: ProjectCache) => {
	const found = await db.execute(
		sql`SELECT t.id, t.title, t.project_id, t.status_id FROM tickets t
			JOIN projects p ON p.id = t.project_id
			WHERE p.archived_at IS NULL LIMIT ${CANDIDATES}`,
	);
	const ticket = (found.rows as Candidate[]).find((row) =>
		chainOf(cache, row.project_id).every((project) => project.archivedAt === null),
	);
	if (ticket === undefined) return;
	const ctx: ServiceCtx = {
		actor: SYSTEM_ACTOR,
		session: null,
		reqId: "warm-up",
		now: new Date(),
		emit: () => {},
		cache,
		actorCache: new Map<string, number>(),
	};
	const title = ticket.title === WARM_TITLE ? `${WARM_TITLE} again` : WARM_TITLE;
	await db
		.transaction(async (tx) => {
			await tickets.update(ctx, tx, { ticket: ticket.id, title });
			await comments.create(ctx, tx, { ticket: ticket.id, body: WARM_TITLE });
			await tickets.move(ctx, tx, { ticket: ticket.id, status: ticket.status_id });
			await tickets.create(ctx, tx, { project: ticket.project_id, title: WARM_TITLE });
			tx.rollback();
		})
		.catch((error: unknown) => {
			if (!(error instanceof TransactionRollbackError)) throw error;
		});
};
