import { ORPCError } from "@orpc/server";
import { type ErrorCode, errors, type GhStatus, TicketRefSchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Emit, Tx } from "../db/tx.ts";
import type { GhRunner } from "../gh/run.ts";

// What every service reads besides its transaction: who acts, where the data
// home is, and what the clock says. `emit` queues an event that the sink
// receives after the commit. `afterCommit` queues work that runs once the
// commit succeeded, which is where an attachment file is removed. `newTx`
// opens a further transaction for that work, because the service transaction
// is closed by then. `vacuum` runs VACUUM (ANALYZE) on the busy tables.
// VACUUM cannot run inside a transaction, so a service queues it with
// `afterCommit`.

export type ActorRef = { name: string; kind: "human" | "agent" | "system" };

export type ServiceCtx = {
	actor: ActorRef;
	session: string | null;
	home: string;
	maxUploadBytes: number;
	version: string;
	apiVersion: string;
	bootId: string;
	now: () => Date;
	ghStatus: () => GhStatus;
	// Every URL the server answers on, network addresses first.
	addresses: () => Promise<string[]>;
	emit: Emit;
	afterCommit: (task: () => Promise<void>) => void;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	vacuum: () => Promise<void>;
};

// The context of an `io` service inside its transaction.
export type IoCtx = ServiceCtx & { core: CoreCtx; localUrl: string; publicUrl: string };

// The context of a `prepare` step, the one place a service may run gh. The
// database has one lock, and every other call waits while a transaction
// holds it. A gh call can take seconds, so it runs before the transaction
// opens. The context of a transaction has no `gh`, so a gh call there fails
// the typecheck.
export type PrepareCtx = ServiceCtx & { gh: GhRunner };

export type { TrellisEvent };

// The error a procedure hands to the client: the contract code, the status
// and the default text of the error map, and the payload the client reads.
export const fail = (code: ErrorCode, data?: unknown) =>
	new ORPCError(code, { defined: true, status: errors[code].status, message: errors[code].message, data });

export const notFound = (kind: string, ref: string) => fail("NOT_FOUND", { kind, ref });

// A ticket with the project it sits in. `archived_at` is the newest archive
// stamp on that project and its ancestors, so it is set when the project or
// any ancestor is archived. Every write refuses such a ticket.
export type TicketRow = {
	id: string;
	project_id: string;
	root_id: string;
	archived_at: string | null;
};

// Accepts a ULID or the `KEY-n` identifier. The number lives on the ticket
// and the key on the root project, so the identifier form joins both. The
// recursive query walks from the ticket's project up the parent links.
export const resolveTicket = async (tx: Tx, ref: string): Promise<TicketRow> => {
	const parsed = TicketRefSchema.parse(ref);
	const match =
		parsed.kind === "ulid" ? sql`t.id = ${parsed.id}` : sql`root.key = ${parsed.key} AND t.number = ${parsed.number}`;
	const [row] = await rows<TicketRow>(
		tx,
		sql`
			SELECT t.id, t.project_id, t.root_id, chain.archived_at
			FROM tickets t
			JOIN projects root ON root.id = t.root_id
			CROSS JOIN LATERAL (
				WITH RECURSIVE up AS (
					SELECT p.id, p.parent_id, p.archived_at FROM projects p WHERE p.id = t.project_id
					UNION ALL
					SELECT p.id, p.parent_id, p.archived_at FROM projects p JOIN up ON p.id = up.parent_id
				)
				SELECT max(up.archived_at) AS archived_at FROM up
			) chain
			WHERE ${match}
		`,
	);
	if (row === undefined) throw notFound("ticket", ref);
	return row;
};

export const assertProjectActive = (ticket: TicketRow) => {
	if (ticket.archived_at !== null) throw fail("PROJECT_ARCHIVED");
};

// Records that this actor acted. The activity, comment, and attachment rows
// point at the actors table, so the row exists before any of them.
export const touchActor = (tx: Tx, actor: ActorRef, at: Date) =>
	tx.execute(sql`
		INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${at}, ${at})
		ON CONFLICT (name, kind) DO UPDATE SET last_seen_at = ${at}
	`);

// `versionStep` is 1 when the change is one a client caches per ticket, so a
// stale cache entry loses to the event that carries the new version.
export const touchTicket = (tx: Tx, input: { id: string; at: Date; versionStep: number }) =>
	tx.execute(sql`
		UPDATE tickets SET updated_at = ${input.at}, version = version + ${input.versionStep} WHERE id = ${input.id}
	`);

export type ActivityInput = {
	ticket: TicketRow;
	action: string;
	meta: Record<string, unknown>;
	at: Date;
};

// One row of the ticket timeline. `batch_id` groups the rows one transaction
// wrote; a single change writes one row and one batch.
export const writeActivity = async (ctx: ServiceCtx, tx: Tx, input: ActivityInput) => {
	await touchActor(tx, ctx.actor, input.at);
	await tx.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, meta, created_at)
		VALUES (
			${ulid()}, ${input.ticket.root_id}, ${input.ticket.project_id}, ${input.ticket.id},
			${ctx.actor.name}, ${ctx.actor.kind}, ${input.action}, ${input.meta}, ${input.at}
		)
	`);
};
