import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "../../../client";
import { rows } from "../../support";

export async function concurrentRequest(db: Db, selector: SQL) {
	const entered = Promise.withResolvers<void>();
	const queued = Promise.withResolvers<void>();
	let heldAt = 0;
	const selection = db.transaction(async (tx) => {
		heldAt = performance.now();
		entered.resolve();
		await queued.promise;
		return rows<{ id: string }>(tx, selector);
	});
	await entered.promise;
	const requestedAt = performance.now();
	const request = db.transaction((tx) => rows<{ title: string }>(tx, sql`SELECT title FROM tickets WHERE id='ticket'`));
	queued.resolve();
	const candidates = await selection;
	const heldMs = performance.now() - heldAt;
	const ticket = await request;
	return { heldMs, requestMs: performance.now() - requestedAt, candidates, ticket };
}
