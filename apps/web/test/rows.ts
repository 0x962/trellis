import type { Activity, ActorRef, Status, Ticket } from "@trellis/api";
import { StatusRefSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { sharedDb } from "./server/db.ts";
import type { TestServer } from "./server/index.ts";

// Reads and writes a test makes on the seeded rows themselves. A field a
// service owns is written through the client; a bookkeeping column no service
// sets, such as the version or the creation instant, is written here.

export const ticketRow = async (server: TestServer, identifier: string): Promise<Ticket> =>
	await server.client.tickets.get({ ticket: identifier });

export const ticketId = async (server: TestServer, identifier: string) => (await ticketRow(server, identifier)).id;

// The columns of `tickets` a test sets by hand.
const ticketColumns: Record<string, string> = {
	version: "version",
	createdAt: "created_at",
	updatedAt: "updated_at",
	completedAt: "completed_at",
	startedAt: "started_at",
};

export type TicketPatch = {
	version?: number;
	createdAt?: string;
	updatedAt?: string;
	completedAt?: string | null;
	startedAt?: string | null;
};

// Writes the bookkeeping columns of one ticket. A test uses it to stand a row
// at an age or a version the seed does not hold.
export const patchTicket = async (server: TestServer, identifier: string, patch: TicketPatch) => {
	const id = await ticketId(server, identifier);
	const { db } = await sharedDb();
	const sets = Object.entries(patch).map(([field, value]) => {
		const column = sql.identifier(ticketColumns[field] as string);
		return field === "version" ? sql`${column} = ${value}` : sql`${column} = ${value}::timestamptz`;
	});
	await db.execute(sql`UPDATE tickets SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
};

export type ActivityRow = {
	ticket: string;
	actor: ActorRef;
	action: string;
	field?: string | null;
	fromValue?: string | null;
	toValue?: string | null;
	meta?: Record<string, unknown>;
	createdAt?: string;
};

// One audit row on `ticket`, the way a service writes one. The timeline lists
// these beside the comments.
export const addActivity = async (server: TestServer, row: ActivityRow) => {
	const ticket = await ticketRow(server, row.ticket);
	const { db } = await sharedDb();
	const found = await db.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field,
			from_value, to_value, meta, created_at)
		SELECT ${ulid()}, p.root_id, ${ticket.project.id}, ${ticket.id}, ${row.actor.name}, ${row.actor.kind},
			${row.action}, ${row.field ?? null}, ${row.fromValue ?? null}, ${row.toValue ?? null},
			${JSON.stringify(row.meta ?? {})}::jsonb, ${row.createdAt ?? new Date().toISOString()}::timestamptz
		FROM projects p WHERE p.id = ${ticket.project.id}
		RETURNING id
	`);
	return (found.rows[0] as { id: number }).id as Activity["id"];
};

// A status ref inside one effective set: a ULID, a slug, a lower-cased name,
// or `category:<category>` for the first status of that category.
export const matchStatus = (statuses: Status[], ref: string): Status | undefined => {
	const parsed = StatusRefSchema.parse(ref);
	if (parsed.kind === "ulid") return statuses.find((status) => status.id === parsed.id);
	if (parsed.kind === "category") return statuses.find((status) => status.category === parsed.category);
	const value = parsed.value.toLowerCase();
	return statuses.find((status) => status.slug === value || status.name.toLowerCase() === value);
};

// The statuses of one project's effective set.
export const statusesOf = async (server: TestServer, project: string) =>
	(await server.client.statuses.list({ project })).statuses;
