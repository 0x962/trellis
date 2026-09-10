import { expect } from "bun:test";
import { ORPCError } from "@orpc/server";
import { type ActorRef, type ErrorCode, errors, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { createCache, type ProjectCache } from "../../src/db/cache.ts";
import { iso } from "../../src/db/queries/support.ts";
import { type Emit, type EventSink, type Tx, withTx } from "../../src/db/tx.ts";
import { navid } from "../fixtures/projects.ts";
import { freshDb } from "./db.ts";

// The one instant every service test runs at. A service stamps every row of
// one transaction with `ctx.now`, so a test compares a column against NOW.
export const NOW = new Date("2026-09-09T12:00:00.000Z");

export const secondsAfter = (seconds: number, from: Date = NOW) => new Date(from.getTime() + seconds * 1000);
export const minutesAgo = (minutes: number, from: Date = NOW) => new Date(from.getTime() - minutes * 60_000);

// What a service receives as `ctx`: the request context (actor, session,
// reqId, now) plus the process state a mutation needs. `emit` is the event
// collector of the open transaction. `cache` is the project tree and the
// status sets. `actorCache` remembers when an actor row was last written,
// so a second upsert inside 30 s runs no statement.
export type ServiceCtx = {
	actor: ActorRef | null;
	session: string | null;
	reqId: string;
	now: Date;
	emit: Emit;
	cache: ProjectCache;
	actorCache: Map<string, number>;
};

export type CtxOptions = {
	actor?: ActorRef | null;
	session?: string | null;
	reqId?: string;
	now?: Date;
};

export type Harness = Awaited<ReturnType<typeof serviceHarness>>;

// One in-memory database per test file with a project cache and an actor
// cache beside it. `reset` empties the tables and replaces both caches, so a
// test never sees the tree of the previous test. `flushed` holds every event
// a committed transaction handed to the sink, in delivery order.
export const serviceHarness = async () => {
	const h = await freshDb();
	let cache = createCache();
	let actorCache = new Map<string, number>();
	const flushed: TrellisEvent[] = [];

	const reset = async () => {
		await h.reset();
		cache = createCache();
		actorCache = new Map();
		flushed.length = 0;
	};

	// Loads the rows the fixtures wrote into the cache. A service rebuilds
	// the cache itself after its own writes.
	const rebuild = () => h.db.transaction((tx) => cache.rebuild(tx));

	const ctx = (emit: Emit, options: CtxOptions = {}): ServiceCtx => ({
		actor: options.actor === undefined ? navid : options.actor,
		session: options.session ?? null,
		reqId: options.reqId ?? "req-1",
		now: options.now ?? NOW,
		emit,
		cache,
		actorCache,
	});

	// Runs `fn` in one transaction with a service context. The events reach
	// `flushed` after the commit.
	const run = async <T>(fn: (ctx: ServiceCtx, tx: Tx) => Promise<T>, options: CtxOptions = {}) => {
		const { result } = await withTx(
			h.db,
			(tx, emit) => fn(ctx(emit, options), tx),
			(events) => {
				flushed.push(...events);
			},
		);
		return result;
	};

	// The same as `run` with the sink the test supplies.
	const runWithSink = <T>(fn: (ctx: ServiceCtx, tx: Tx) => Promise<T>, sink: EventSink, options: CtxOptions = {}) =>
		withTx(h.db, (tx, emit) => fn(ctx(emit, options), tx), sink);

	// A read-only transaction for a query or an invariant check.
	const read = <T>(fn: (tx: Tx) => Promise<T>) => h.db.transaction(fn);

	const rows = async <T = Record<string, unknown>>(query: ReturnType<typeof sql>) => {
		const result = await h.db.execute(query);
		return result.rows as T[];
	};

	const one = async <T = Record<string, unknown>>(query: ReturnType<typeof sql>) => (await rows<T>(query))[0]!;

	return {
		db: h.db,
		close: h.close,
		reset,
		rebuild,
		get cache() {
			return cache;
		},
		get actorCache() {
			return actorCache;
		},
		flushed,
		ctx,
		run,
		runWithSink,
		read,
		rows,
		one,
	};
};

// Awaits a rejection and checks it is the declared error `code` with the
// status the contract gives it. Returns the error so a test reads `data`.
// A rejection that is not an ORPCError is rethrown as it is, so the test
// output names the real failure.
export const expectError = async <C extends ErrorCode>(promise: Promise<unknown>, code: C) => {
	const outcome = await promise.then(
		(value) => ({ ok: true as const, value }),
		(error: unknown) => ({ ok: false as const, error }),
	);
	if (outcome.ok) throw new Error(`Expected ${code}, the call returned ${JSON.stringify(outcome.value)}.`);
	if (!(outcome.error instanceof ORPCError)) throw outcome.error;
	const error = outcome.error as ORPCError<C, Record<string, unknown>>;
	expect(error.code).toBe(code);
	expect(error.status).toBe(errors[code].status);
	return error;
};

export const eventsOfType = (events: TrellisEvent[], type: TrellisEvent["type"]) =>
	events.filter((event) => event.type === type);

export const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

// A timestamp column as the ISO string `ctx.now.toISOString()` gives. The
// driver returns a timestamptz as Postgres text with the session zone.
export const at = (column: string) => sql`${iso(sql.raw(column))} AS ${sql.raw(column)}`;

// The activity rows of the whole database in id order.
export type ActivityRow = {
	id: number;
	batch_id: string;
	root_id: string;
	project_id: string;
	ticket_id: string | null;
	actor_name: string;
	actor_kind: string;
	action: string;
	field: string | null;
	from_value: string | null;
	to_value: string | null;
	meta: Record<string, unknown>;
	created_at: string;
};

export const activityRows = (h: Pick<Harness, "rows">) =>
	h.rows<ActivityRow>(
		sql`SELECT id, batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field,
			from_value, to_value, meta, ${at("created_at")} FROM activity ORDER BY id`,
	);
