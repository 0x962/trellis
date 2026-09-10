import { ulid } from "ulid";
import { type ActorRef, type Executor, insertRow, navid, type Row } from "./projects.ts";

const now = () => new Date();

// Auto numbers start at 1000, so a test that names a number below that
// never collides with one a fixture handed out.
let nextNumber = 1000;

export type TicketSeed = {
	projectId: string;
	rootId: string;
	statusId: string;
	number?: number;
	title?: string;
	description?: string;
	priority?: string;
	parentId?: string | null;
	position?: number;
	completedAt?: Date | null;
	startedAt?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
};

export const seedTicket = async (tx: Executor, seed: TicketSeed, overrides: Row = {}) => {
	const id = ulid();
	const number = seed.number ?? nextNumber++;
	await insertRow(tx, "tickets", {
		id,
		project_id: seed.projectId,
		root_id: seed.rootId,
		number,
		title: seed.title ?? `Ticket ${number}`,
		description: seed.description ?? "",
		priority: seed.priority ?? "none",
		status_id: seed.statusId,
		parent_id: seed.parentId ?? null,
		position: seed.position ?? number * 1024,
		version: 1,
		started_at: seed.startedAt ?? null,
		completed_at: seed.completedAt ?? null,
		created_at: seed.createdAt ?? now(),
		updated_at: seed.updatedAt ?? now(),
		...overrides,
	});
	return id;
};

export const seedComment = async (
	tx: Executor,
	ticketId: string,
	body: string,
	actor: ActorRef = navid,
	createdAt: Date = now(),
) => {
	const id = ulid();
	await insertRow(tx, "comments", {
		id,
		ticket_id: ticketId,
		body,
		actor_name: actor.name,
		actor_kind: actor.kind,
		created_at: createdAt,
		updated_at: createdAt,
	});
	return id;
};

export type ActivitySeed = {
	rootId: string;
	projectId: string;
	ticketId?: string | null;
	actor?: ActorRef;
	action?: string;
	field?: string | null;
	fromValue?: string | null;
	toValue?: string | null;
	meta?: Record<string, unknown>;
	createdAt?: Date;
};

export const seedActivity = async (tx: Executor, seed: ActivitySeed) => {
	const row = await insertRow(tx, "activity", {
		batch_id: ulid(),
		root_id: seed.rootId,
		project_id: seed.projectId,
		ticket_id: seed.ticketId ?? null,
		actor_name: (seed.actor ?? navid).name,
		actor_kind: (seed.actor ?? navid).kind,
		action: seed.action ?? "ticket.updated",
		field: seed.field ?? null,
		from_value: seed.fromValue ?? null,
		to_value: seed.toValue ?? null,
		meta: seed.meta ?? {},
		created_at: seed.createdAt ?? now(),
	});
	return row.id as number;
};
