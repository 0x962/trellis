import { afterAll, beforeAll, expect, test } from "bun:test";
import { FlowExecutionListV1InputSchema, FlowExecutionViewV1Schema, missingPartsText } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../apps/server/src/context.ts";
import { createCache } from "../../../../apps/server/src/db/cache.ts";
import { reviewFixture } from "../../../../apps/server/src/db/queries/reviewReady.fixtures.ts";
import { ticketSummary } from "../../../../apps/server/src/db/queries/ticketGet.ts";
import { openTestDb } from "../../../../apps/server/src/db/testDb.ts";
import { list as listFlows } from "../../../../apps/server/src/services/flows/flows.ts";
import { getView, list } from "../../../../apps/server/src/services/langflowDispatch";
import { flowReadiness } from "../../../../packages/cli/src/commands/ready/flowReadiness.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const ctx: ServiceCtx = {
	actor: { kind: "human", name: "Policy" },
	session: null,
	reqId: "policy-clients",
	now: new Date("2026-09-29T10:00:00Z"),
	cache: createCache(),
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://localhost",
};
beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO actors (name,kind,first_seen_at,last_seen_at) VALUES ('Policy','human',now(),now())`,
	);
});
afterAll(async () => {
	await db.$client.close();
});

const client = {
	flows: { list: (input) => db.transaction((tx) => listFlows(ctx, tx, input)) },
	flowDocumentsV1: {
		list: (input) => db.transaction((tx) => list(ctx, tx, FlowExecutionListV1InputSchema.parse(input))),
		view: (input) => db.transaction(async (tx) => FlowExecutionViewV1Schema.parse(await getView(ctx, tx, input))),
	},
	pullRequests: { readFlowWaiver: async () => null },
} satisfies {
	flows: Pick<TrellisClient["flows"], "list">;
	flowDocumentsV1: Pick<TrellisClient["flowDocumentsV1"], "list" | "view">;
	pullRequests: Pick<TrellisClient["pullRequests"], "readFlowWaiver">;
};

for (const engine of ["legacy", "langflow"] as const) {
	test(`${engine} service views give the CLI and web row identical credit`, async () => {
		const f = await reviewFixture(db);
		const ref = { id: f.pull, url: `https://github.com/${f.project.toLowerCase()}/app/pull/1` };
		const check = async (expected: boolean) => {
			const cli = await flowReadiness(client as unknown as TrellisClient, ref, f.ticket);
			const ticket = await db.transaction((tx) => ticketSummary(tx, f.ticket));
			const row = ticket.prRows[0]!;
			expect(cli.satisfied).toBe(expected);
			expect(row.reviewGaps.some((gap) => gap.kind === "flow-run")).toBe(!expected);
			if (expected) expect(missingPartsText(row)).not.toContain("flow");
			else expect(missingPartsText(row)).toContain("flow");
		};
		await f.insertRun(engine, "waiting");
		await check(false);
		await f.insertRun(engine, "failed");
		await check(false);
		await f.insertRun(engine, "succeeded");
		await f.insertRun(engine, "failed");
		await db.execute(sql`UPDATE pull_requests SET head_sha='later-head' WHERE id=${f.pull}`);
		await check(true);
		const ids = await db.transaction((tx) => list(ctx, tx, { diffId: f.pull }));
		expect(ids.map((run) => run.engine)).toEqual([engine, engine, engine, engine]);
		await db.execute(sql`DELETE FROM flows WHERE id=${f.flow}`);
		await check(true);
	});
}
