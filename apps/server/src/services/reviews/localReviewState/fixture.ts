import type { ActorRef, ReviewSubmit, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache } from "../../../db/cache.ts";
import { ticketSummary } from "../../../db/queries/ticketGet.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import { setLocalState } from "../../pullRequestLocalState.ts";
import { link, list } from "../../pullRequests.ts";
import type { IoCtx } from "../../support.ts";
import { prs } from "../prs.ts";
import { submit } from "../remote.ts";
import { status } from "../status.ts";

export async function localReviewFixture() {
	const db = await openTestDb();
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	const events: TrellisEvent[] = [];
	let clock = Date.parse("2026-09-29T20:00:00Z");
	const project = ulid();
	const statusId = ulid();
	const ticketId = ulid();
	const human: ActorRef = { kind: "human", name: "Local reviewer" };
	const agent: ActorRef = { kind: "agent", name: "Local worker" };
	const ctx = (actor: ActorRef): IoCtx => {
		const now = new Date(clock++);
		const emit = (event: TrellisEvent) => {
			events.push(event);
		};
		return {
			actor,
			session: null,
			home: import.meta.dir,
			version: "test",
			apiVersion: "1",
			bootId: "local-review",
			now: () => now,
			ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: null }),
			addresses: async () => [],
			log: () => {},
			emit,
			afterCommit: () => {},
			newTx: run,
			vacuum: async () => {},
			localUrl: "http://localhost",
			publicUrl: "http://localhost",
			background: () => {},
			core: {
				actor,
				session: null,
				reqId: ulid(),
				now,
				emit,
				cache: createCache(),
				actorCache: new Map(),
				dropBlobs: () => {},
				publicUrl: "http://localhost",
			},
		};
	};
	const at = new Date(clock);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project}, 'GLY', 'gly', 'Glyph fixture', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${project}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${project}, 1, 'Local review colors', ${statusId}, 0, ${at}, ${at})`);
	const url = "https://github.com/fixture/review/pull/1";
	const linked = await run((tx) =>
		link(ctx(human), tx, {
			ticket: "GLY-1",
			url,
			ref: { owner: "fixture", repo: "review", number: 1 },
			fetched: { error: "Isolated fixture" },
		}),
	);
	const read = () =>
		run(async (tx) => ({
			linked: (await list(ctx(human), tx, { ticket: "GLY-1" }))[0]!,
			index: (await prs(ctx(human), tx, { all: true })).find((pr) => pr.id === linked.id)!,
			status: await status(ctx(human), tx, { pr: url, remote: { state: "OPEN", headRefOid: "fixture-head" } }),
			ticket: await ticketSummary(tx, ticketId),
		}));
	return {
		db,
		run,
		ctx,
		human,
		agent,
		events,
		id: linked.id,
		url,
		read,
		mark: (localState: "ready" | "not-ready") =>
			run((tx) => setLocalState(ctx(agent), tx, { id: linked.id, localState })),
		submit: (actor: ActorRef, verdict: ReviewSubmit["verdict"]) =>
			run((tx) =>
				submit(ctx(actor), tx, {
					pr: url,
					headSha: "fixture-head",
					verdict,
					body: "Local review",
					threadIds: [],
				}),
			),
		close: () => db.$client.close(),
	};
}
