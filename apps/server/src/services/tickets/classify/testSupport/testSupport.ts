import { expect } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../../context.ts";
import { createCache } from "../../../../db/cache.ts";
import { openTestDb } from "../../../../db/testDb.ts";
import type { Tx } from "../../../../db/tx.ts";
import { create as createEpic } from "../../../epics/epics.ts";
import type { evaluate } from "../../../providers/evaluate";
import type { ProviderFetch } from "../../../providers/remote.ts";
import { remoteHarness } from "../../../providers/testSupport/testSupport.ts";
import { create as createWave } from "../../../waves/waves.ts";

export async function classificationHarness(at: string) {
	let inside = false;
	const db = await openTestDb();
	const h = remoteHarness(db);
	const core: ServiceCtx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	h.ctx.core = core;
	h.ctx.newTx = async <T>(fn: (tx: Tx) => Promise<T>) => {
		inside = true;
		try {
			return await db.transaction(fn);
		} finally {
			inside = false;
		}
	};
	await h.create({ models: ["typesafe-ai/jev"] });

	let number = 0;
	const project = async () => {
		const id = ulid();
		const key = `JC${++number}`;
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, ${at}, ${at})`);
		await db.transaction((tx) => core.cache.rebuild(tx));
		return { id, key };
	};
	const epic = (project: string, name: string) => db.transaction((tx) => createEpic(core, tx, { project, name }));
	const wave = (epic: string, name: string) => db.transaction((tx) => createWave(core, tx, { epic, name }));
	type Evaluation = Parameters<typeof evaluate>[1];
	type Candidate = { epic: string; wave: string | null; description: string };
	const answer =
		(choose: (choices: Record<string, Candidate>, input: Evaluation) => string | undefined): ProviderFetch =>
		async (_url, init) => {
			expect(inside).toBe(false);
			const input = JSON.parse(init.body as string) as Evaluation & {
				state: { candidates: Record<string, Candidate> };
			};
			const placement = choose(input.state.candidates, input);
			return Response.json({
				answers: {
					priority: { type: "choice", choice: "high" },
					...(placement === undefined ? {} : { placement: { type: "choice", choice: placement } }),
				},
			});
		};
	return { db, h, core, project, epic, wave, answer };
}
