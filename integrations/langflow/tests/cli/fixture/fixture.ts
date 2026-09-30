import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../../apps/server/src/context.ts";
import { createCache } from "../../../../../apps/server/src/db/cache.ts";
import { reviewFixture } from "../../../../../apps/server/src/db/queries/reviewReady.fixtures.ts";
import { openTestDb } from "../../../../../apps/server/src/db/testDb.ts";
import type { IoCtx } from "../../../../../apps/server/src/services/support.ts";

export const fixture = async () => {
	const db = await openTestDb();
	await db.execute(sql`INSERT INTO actors(name,kind,first_seen_at,last_seen_at) VALUES ('Policy','human',now(),now())`);
	const data = await reviewFixture(db);
	await db.execute(sql`UPDATE flows SET version=2 WHERE id=${data.flow}`);
	const legacy = await data.insertRun("legacy", "running");
	const view = await data.insertRun("langflow", "waiting");
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "Policy" },
		session: null,
		reqId: "cli-routes",
		now: data.at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const io: IoCtx = {
		actor: { kind: "human", name: "Policy" },
		session: null,
		home: "/unused",
		version: "fixture",
		apiVersion: "1",
		bootId: "cli-routes",
		now: () => ctx.now,
		ghStatus: () => ({ ok: true, user: "Policy", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		emit: ctx.emit,
		afterCommit: () => {
			throw new Error("Unexpected CLI read afterCommit");
		},
		newTx: db.transaction.bind(db),
		vacuum: async () => {
			throw new Error("Unexpected CLI read vacuum");
		},
		core: ctx,
		localUrl: "http://localhost",
		publicUrl: ctx.publicUrl,
		background: () => {
			throw new Error("Unexpected CLI read background");
		},
	};
	return { ...data, db, legacy, view, ctx, io };
};
