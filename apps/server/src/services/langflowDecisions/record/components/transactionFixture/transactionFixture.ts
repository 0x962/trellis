import type { ServiceCtx } from "../../../../../context.ts";
import { createCache } from "../../../../../db/cache.ts";
import { migrate } from "../../../../../db/migrate.ts";
import { receiptFixture } from "../../../../../db/queries/langflowExecution/fixtures/fixture.ts";
import { beforeDocuments } from "../../../../../db/queries/langflowExecution/fixtures/migration.ts";
import { commitProjection } from "../../../../../db/queries/langflowExecution/projections.ts";
import { testFixture } from "../../../testFixture";

export async function transactionFixture() {
	const database = await beforeDocuments();
	await migrate(database);
	const storage = await receiptFixture(true, database);
	const fixture = testFixture();
	const view = {
		...storage.view,
		revision: storage.view.revision + 1,
		submission: {
			...storage.view.submission!,
			engineJobId: storage.authority.engineJobId,
			engineEpoch: storage.authority.engineEpoch,
		},
		occurrences: fixture.view.occurrences,
	};
	const checkpoint = { ...fixture.checkpoint, engineEpoch: storage.authority.engineEpoch };
	await storage.db.transaction((tx) =>
		commitProjection(tx, {
			executionId: view.id,
			expectedRevision: storage.view.revision,
			view,
			checkpoint,
			event: null,
			sourceBytes: null,
		}),
	);
	const ctx: ServiceCtx = {
		...fixture.ctx,
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const system: ServiceCtx = { ...ctx, actor: { kind: "system", name: "trellis" } };
	return { ...storage, ctx, system, input: { ...fixture.input, expectedRevision: view.revision }, view };
}
