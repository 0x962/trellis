import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { receiptFixture } from "../../db/queries/langflowExecution/fixtures/fixture.ts";
import { langflowExecutionProjections } from "../../db/tables/langflowExecution";
import { type Tx, withTx } from "../../db/tx.ts";
import { initialize } from "./initialize";
import { fixture } from "./testFixture.ts";

export async function databaseFixture(open = true) {
	const { db, authority } = await receiptFixture(open);
	await db.delete(langflowExecutionProjections);
	const f = fixture();
	const ctx: ServiceCtx = {
		actor: { kind: "system", name: "trellis" },
		session: null,
		reqId: "fixture",
		now: f.now,
		emit: () => undefined,
		cache: createCache(),
		actorCache: new Map(),
		dropBlobs: () => undefined,
		publicUrl: "http://localhost",
	};
	const call = <T>(action: (ctx: ServiceCtx, tx: Tx) => Promise<T>) =>
		withTx(db, (tx, emit) => action({ ...ctx, emit }, tx));
	const initial = await call((ctx, tx) => initialize(ctx, tx, { executionId: f.view.id }));
	f.view = initial.result;
	f.observed.expectedRevision = 1;
	f.observed.occurrences = [];
	f.observed.status = "running";
	return { db, call, f, authority };
}
