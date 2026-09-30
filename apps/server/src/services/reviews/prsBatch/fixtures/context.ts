import { ulid } from "ulid";
import { createCache } from "../../../../db/cache.ts";
import type { openTestDb } from "../../../../db/testDb.ts";
import type { IoCtx } from "../../../support.ts";

export async function reviewPrsContext(db: Awaited<ReturnType<typeof openTestDb>>): Promise<IoCtx> {
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const actor = { name: "Policy", kind: "human" as const };
	const now = new Date("2026-09-30T00:00:00Z");
	return {
		actor,
		session: null,
		home: import.meta.dir,
		version: "test",
		apiVersion: "test",
		bootId: "test",
		now: () => now,
		ghStatus: () => {
			throw new Error("Unexpected GitHub access");
		},
		addresses: async () => [],
		log: () => {},
		emit: () => {},
		afterCommit: () => {
			throw new Error("Unexpected after-commit action");
		},
		background: () => {
			throw new Error("Unexpected background action");
		},
		newTx: () => {
			throw new Error("Unexpected nested transaction");
		},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		core: {
			actor,
			session: null,
			reqId: ulid(),
			now,
			cache,
			actorCache: new Map(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost",
		},
	};
}
