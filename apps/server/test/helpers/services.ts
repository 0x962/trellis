import { afterAll, afterEach, beforeAll, beforeEach, expect } from "bun:test";
import { ORPCError } from "@orpc/server";
import type { ErrorCode, errors } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ctx } from "../../src/context.ts";
import { type EventSink, type Tx, withTx } from "../../src/db/tx.ts";
import type { ActorRef } from "../fixtures";
import { assertStatusInvariant } from "../invariants.ts";
import { freshDb, type TestDb } from "./db.ts";

export type Db = TestDb["db"];

// The hooks every service test file shares. One in-memory database per file,
// an empty database before each test, and the status invariant after each
// test: no ticket points at a status outside owner(ticket.project).
// `as(actor)` runs one service call in one transaction with a context for
// that actor and returns the result and the events queued on the commit.
export const serviceHarness = () => {
	let h: TestDb;
	beforeAll(async () => {
		h = await freshDb();
	});
	beforeEach(() => h.reset());
	afterEach(() => h.db.transaction((tx) => assertStatusInvariant(tx)));
	afterAll(() => h.close());

	const as =
		(actor: ActorRef, sink?: EventSink) =>
		<T>(fn: (ctx: Ctx, tx: Tx) => Promise<T>) =>
			withTx(h.db, (tx, emit) => fn({ actor, session: null, reqId: "test", emit }, tx), sink);

	return {
		get db() {
			return h.db;
		},
		as,
	};
};

export type ErrorData<C extends ErrorCode> = z.infer<(typeof errors)[C]["data"]>;

// Awaits a rejection with the given contract code and returns its data. Any
// other throw passes through, so the test fails on the real cause.
export const expectError = async <C extends ErrorCode>(promise: Promise<unknown>, code: C): Promise<ErrorData<C>> => {
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}
	if (!(caught instanceof ORPCError)) throw caught ?? new Error(`Expected ${code}, but the call returned.`);
	expect(caught.code).toBe(code);
	return caught.data as ErrorData<C>;
};

export const query = async <T>(db: Db, statement: SQL) => (await db.execute(statement)).rows as T[];

// A timestamp column as epoch milliseconds, whatever form the driver hands back.
export const at = (value: unknown) => new Date(value as Date).getTime();

export type TicketRow = {
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
	started_at: Date | null;
	completed_at: Date | null;
	created_at: Date;
	updated_at: Date;
};

export const ticketRow = async (db: Db, id: string) =>
	(await query<TicketRow>(db, sql`SELECT * FROM tickets WHERE id = ${id}`))[0];

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
	created_at: Date;
};

// Every activity row in id order, or the rows of one ticket.
export const activityRows = (db: Db, ticketId?: string) =>
	query<ActivityRow>(
		db,
		ticketId === undefined
			? sql`SELECT * FROM activity ORDER BY id`
			: sql`SELECT * FROM activity WHERE ticket_id = ${ticketId} ORDER BY id`,
	);

// The rows a delete leaves behind: project-level, with no ticket id.
export const traceRows = (db: Db) =>
	query<ActivityRow>(db, sql`SELECT * FROM activity WHERE ticket_id IS NULL ORDER BY id`);

export const distinct = <T>(values: T[]) => [...new Set(values)];
