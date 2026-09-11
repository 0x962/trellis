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

type Located = { id: string; project_id: string; root_id: string };

// The row of `KEY-n`, read straight from the database. A write below never
// makes a service call of its own, so a test that counts the calls its page
// made counts only those.
const locate = async (server: TestServer, identifier: string): Promise<Located> => {
	await server.ready;
	const [key, number] = identifier.split("-");
	const { db } = await sharedDb();
	const found = await db.execute(sql`
		SELECT t.id, t.project_id, t.root_id FROM tickets t JOIN projects p ON p.id = t.root_id
		WHERE p.key = ${key} AND t.number = ${Number(number)}
	`);
	const row = found.rows[0] as Located | undefined;
	if (row === undefined) throw new Error(`No ticket ${identifier}.`);
	return row;
};

// The columns of `tickets` a test sets by hand.
const ticketColumns: Record<string, string> = {
	version: "version",
	description: "description",
	createdAt: "created_at",
	updatedAt: "updated_at",
	completedAt: "completed_at",
	startedAt: "started_at",
};

export type TicketPatch = {
	version?: number;
	// The text another actor left behind, written without a call of its own,
	// so a test that counts the calls of its page counts only those.
	description?: string;
	createdAt?: string;
	updatedAt?: string;
	completedAt?: string | null;
	startedAt?: string | null;
};

// Writes the bookkeeping columns of one ticket. A test uses it to stand a row
// at an age or a version the seed does not hold.
export const patchTicket = async (server: TestServer, identifier: string, patch: TicketPatch) => {
	const { id } = await locate(server, identifier);
	const { db } = await sharedDb();
	const sets = Object.entries(patch).map(([field, value]) => {
		const column = sql.identifier(ticketColumns[field] as string);
		if (field === "version") return sql`${column} = ${value}`;
		if (field === "description") return sql`${column} = ${value}`;
		return sql`${column} = ${value}::timestamptz`;
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
	const ticket = await locate(server, row.ticket);
	const { db } = await sharedDb();
	// Every activity row names an actor the actors table holds.
	await db.execute(sql`
		INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES (${row.actor.name}, ${row.actor.kind}, now(), now())
		ON CONFLICT (name, kind) DO NOTHING
	`);
	const found = await db.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field,
			from_value, to_value, meta, created_at)
		VALUES (${ulid()}, ${ticket.root_id}, ${ticket.project_id}, ${ticket.id}, ${row.actor.name}, ${row.actor.kind},
			${row.action}, ${row.field ?? null}, ${row.fromValue ?? null}, ${row.toValue ?? null},
			${JSON.stringify(row.meta ?? {})}::jsonb, ${row.createdAt ?? new Date().toISOString()}::timestamptz)
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

// The settings row that holds the default actor name. `actors.default`
// reports `stored: true` only while the row is there, and `settings.get`
// falls back to the machine name without it.
export const clearStoredActorName = async (server: TestServer) => {
	await server.ready;
	const { db } = await sharedDb();
	await db.execute(sql`DELETE FROM settings WHERE key = 'defaultActorName'`);
};

export const storedActorName = async (server: TestServer) => (await server.client.settings.get()).defaultActorName;

// Archives `ref` through the service, so every write under it is refused.
export const archiveProject = async (server: TestServer, ref: string) => {
	await server.client.projects.update({ project: ref, archived: true });
};
