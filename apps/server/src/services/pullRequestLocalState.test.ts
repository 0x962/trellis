import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { candidates } from "./needsYou/candidates.ts";
import { setLocalState } from "./pullRequestLocalState.ts";
import { link } from "./pullRequests.ts";
import type { ServiceCtx } from "./support.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let events: { type: string }[];
let ticketId: string;

const root = ulid();
const at = new Date("2026-09-22T10:00:00.000Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// The fields of the service context that `link` and `setLocalState` read.
const ctxOf = (actor: ActorRef) =>
	({
		actor,
		now: () => at,
		emit: (event: { type: string }) => {
			events.push(event);
		},
	}) as unknown as ServiceCtx;

beforeEach(async () => {
	db = await openTestDb();
	events = [];
	ticketId = ulid();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'LOC', 'loc', 'Local', ${at}, ${at})`);
	const status = ulid();
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${root}, 'In Progress', 'in-progress', 'started', NULL, 'accent', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${root}, ${root}, 1, 'Add the local draft state', ${status}, 1, ${at}, ${at})`);
});

afterEach(async () => {
	await db.$client.close();
});

// gh answers with an error, so the link stores the pull request without a
// gh process, the way it does while gh is away.
const linkAs = (actor: ActorRef, number: number) =>
	run((tx) =>
		link(ctxOf(actor), tx, {
			ticket: "LOC-1",
			url: `https://github.com/acme/app/pull/${number}`,
			ref: { owner: "acme", repo: "app", number },
			fetched: { error: "gh is away" },
		}),
	);

const agent: ActorRef = { kind: "agent", name: "claude-code" };
const person: ActorRef = { kind: "human", name: "dana" };

test("a pull request that an agent links starts as a draft", async () => {
	const linked = await linkAs(agent, 101);

	expect(linked.localState).toBe("draft");
});

test("a pull request that a person links starts as ready", async () => {
	const linked = await linkAs(person, 102);

	expect(linked.localState).toBe("ready");
});

test("a second link of the same pull request keeps the state that trellis ready set", async () => {
	const linked = await linkAs(agent, 103);
	await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));

	const again = await linkAs(agent, 103);

	expect(again.localState).toBe("ready");
});

test("setLocalState writes the state, announces the update and changes the turn", async () => {
	const linked = await linkAs(agent, 104);
	const [draftTicket] = await run((tx) => ticketSummaries(tx, [ticketId]));
	const draftInbox = await run((tx) => candidates(tx, "dana"));

	events = [];
	const ready = await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));
	const [readyTicket] = await run((tx) => ticketSummaries(tx, [ticketId]));
	const readyInbox = await run((tx) => candidates(tx, "dana"));

	expect(draftTicket!.prRows.map((row) => row.localState)).toEqual(["draft"]);
	expect(draftTicket!.pr?.localState).toBe("draft");
	expect(draftInbox).toEqual([]);
	expect(ready.localState).toBe("ready");
	expect(events.map((event) => event.type)).toEqual(["pr.updated"]);
	expect(readyTicket!.prRows.map((row) => row.localState)).toEqual(["ready"]);
	expect(readyInbox.map((item) => item.identifier)).toEqual(["LOC-1"]);
});

test("setLocalState to the stored state writes nothing and announces nothing", async () => {
	const linked = await linkAs(person, 105);
	events = [];

	const same = await run((tx) => setLocalState(ctxOf(person), tx, { id: linked.id, localState: "ready" }));

	expect(same.localState).toBe("ready");
	expect(events).toEqual([]);
});
