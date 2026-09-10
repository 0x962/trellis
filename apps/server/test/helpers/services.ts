import { afterAll, afterEach, beforeAll, beforeEach, expect } from "bun:test";
import { ORPCError } from "@orpc/server";
import { type ActorRef, type ErrorCode, errors, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { createCache, type ProjectCache } from "../../src/db/cache.ts";
import { iso } from "../../src/db/queries/support.ts";
import { type Emit, type EventSink, type Tx, withTx } from "../../src/db/tx.ts";
import { navid } from "../fixtures/projects.ts";
import { assertStatusInvariant } from "../invariants.ts";
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

	// Every service call leaves the status invariant intact: no ticket points
	// at a status outside owner(ticket.project). The check runs after the
	// commit, so a service that repairs the invariant inside its own
	// transaction passes.
	const checkInvariant = () => h.db.transaction((tx) => assertStatusInvariant(tx));

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
		await checkInvariant();
		return result;
	};

	// The same as `run` with the sink the test supplies.
	const runWithSink = async <T>(
		fn: (ctx: ServiceCtx, tx: Tx) => Promise<T>,
		sink: EventSink,
		options: CtxOptions = {},
	) => {
		const outcome = await withTx(h.db, (tx, emit) => fn(ctx(emit, options), tx), sink);
		await checkInvariant();
		return outcome;
	};

	// A read-only transaction for a query or an invariant check.
	const read = <T>(fn: (tx: Tx) => Promise<T>) => h.db.transaction(fn);

	// A row is what the driver returns. A test that reads a column names its
	// type through `T`, or compares the value against a typed one.
	// biome-ignore lint/suspicious/noExplicitAny: an untyped row must compare against any column type.
	const rows = async <T = Record<string, any>>(query: ReturnType<typeof sql>) => {
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
	const error = outcome.error as ORPCError<C, ErrorData<C>>;
	expect(error.code).toBe(code);
	expect(error.status).toBe(errors[code].status);
	return error;
};

// The payload the contract declares for one error code.
export type ErrorData<C extends ErrorCode> = z.infer<(typeof errors)[C]["data"]>;

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

export type Db = Harness["db"];

export const query = async <T>(db: Db, statement: ReturnType<typeof sql>) => (await db.execute(statement)).rows as T[];

// A timestamp column as epoch milliseconds, whatever form the driver hands
// back: a Date for `SELECT *`, an ISO string for a column `iso` wrapped.
export const millis = (value: unknown) => new Date(value as Date).getTime();

export const distinct = <T>(values: T[]) => [...new Set(values)];

// The `data` of the declared error a call rejects with, typed as the
// contract declares it for that code.
export const expectErrorData = async <C extends ErrorCode>(promise: Promise<unknown>, code: C) =>
	(await expectError(promise, code)).data;

// One ticket row as the table holds it, for a test that reads a column the
// wire shape hides: `started_at`, `completed_at`, `parent_id`.
export type TicketDbRow = {
	id: string;
	project_id: string;
	root_id: string;
	number: number;
	title: string;
	description: string;
	priority: string;
	status_id: string;
	parent_id: string | null;
	position: number;
	version: number;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
};

export const ticketRow = async (db: Db, id: string) =>
	(await query<TicketDbRow>(db, sql`SELECT * FROM tickets WHERE id = ${id}`))[0];

// Every activity row in id order, or the rows of one ticket. The columns
// arrive as the table holds them, so a test reads `meta` and `batch_id`.
export const activityOf = (db: Db, ticketId?: string) =>
	query<ActivityRow>(
		db,
		ticketId === undefined
			? sql`SELECT * FROM activity ORDER BY id`
			: sql`SELECT * FROM activity WHERE ticket_id = ${ticketId} ORDER BY id`,
	);

// The rows a ticket delete leaves behind: project-level, with no ticket id.
export const traceRows = (db: Db) =>
	query<ActivityRow>(db, sql`SELECT * FROM activity WHERE ticket_id IS NULL ORDER BY id`);

// The hooks a ticket service test file shares: one in-memory database per
// file, an empty database before each test, and the status invariant after
// each test. `as(actor)` runs one service call in one transaction as that
// actor and returns the result with the events the commit queued. The
// transaction rebuilds the project cache first, so the call sees the tree
// the fixtures seeded.
export const ticketHarness = () => {
	let h: Harness;
	beforeAll(async () => {
		h = await serviceHarness();
	});
	beforeEach(() => h.reset());
	afterEach(() => h.read((tx) => assertStatusInvariant(tx)));
	afterAll(() => h.close());

	const as =
		(actor: ActorRef, sink?: EventSink) =>
		<T>(fn: (ctx: ServiceCtx, tx: Tx) => Promise<T>) =>
			withTx(
				h.db,
				async (tx, emit) => {
					await h.cache.rebuild(tx);
					return fn(h.ctx(emit, { actor, now: new Date() }), tx);
				},
				sink,
			);

	return {
		get db() {
			return h.db;
		},
		as,
	};
};
