import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { type DiskDb, diskDb } from "../../test/helpers/db.ts";
import { freshHome } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import { withTx } from "../db/tx.ts";
import * as personas from "./personas.ts";

let handle: DiskDb;
let dataDir: string;
beforeAll(async () => {
	dataDir = join(freshHome(), "db");
	handle = await diskDb(dataDir);
});
afterAll(() => handle.close());

test("a persona survives a database close and reopen", async () => {
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: "persona-persistence",
		now: new Date("2026-09-10T12:00:00Z"),
		emit: () => {},
		cache: createCache(),
		actorCache: new Map(),
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	};
	const { result: created } = await withTx(handle.db, (tx, emit) =>
		personas.create({ ...ctx, emit }, tx, { name: "Reviewer", instruction: "Read the diff.\nReport defects." }),
	);
	await handle.db.transaction(assertStatusInvariant);
	await handle.close();
	handle = await diskDb(dataDir);
	expect(await handle.db.transaction((tx) => personas.list(ctx, tx, {}))).toEqual([created]);
	await handle.db.transaction(assertStatusInvariant);
});
