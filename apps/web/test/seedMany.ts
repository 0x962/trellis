import type { Priority } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { sharedDb } from "./server/db.ts";
import type { TestServer } from "./server/index.ts";

export type SeedManyOptions = {
	// The project path, `CDE` or `CDE.web`. The tickets take its root's numbers.
	project: string;
	count: number;
	// A status slug of the project's set. `todo` by default.
	status?: string;
	priority?: Priority;
};

// Adds `count` tickets to the server, numbered after the root's last ticket.
// The virtualizer tests need thousands of rows, which is too many for one
// service call each, so the rows and their created activity go in with two
// statements. Every ticket is a plain row by navid; a higher number is a
// more recent change, so the default order lists them newest number first.
export const seedTickets = async (server: TestServer, options: SeedManyOptions) => {
	const project = await server.client.projects.get({ project: options.project });
	const slug = options.status ?? "todo";
	const status = project.statuses.find((entry) => entry.slug === slug);
	if (status === undefined) throw new Error(`no status ${slug} in ${project.path}`);
	const root = project.rootId === project.id ? project : await server.client.projects.get({ project: project.rootId });
	const { db } = await sharedDb();
	const first = root.ticketCounter + 1;
	const rows = Array.from({ length: options.count }, (_, index) => {
		const number = first + index;
		const at = new Date(Date.now() - (options.count - index) * 60_000).toISOString();
		return {
			id: ulid(),
			number,
			title: `Seeded ticket ${number}`,
			at,
			started: status.category === "todo" ? null : at,
			completed: status.category === "done" || status.category === "canceled" ? at : null,
		};
	});
	const json = JSON.stringify(rows);
	await db.execute(sql`
		INSERT INTO tickets (id, project_id, root_id, number, title, description, priority, status_id, parent_id,
			position, version, started_at, completed_at, created_at, updated_at)
		SELECT r.id, ${project.id}, ${project.rootId}, r.number, r.title, '', ${options.priority ?? "none"},
			${status.id}, NULL, r.number * 1024, 1, r.started::timestamptz, r.completed::timestamptz,
			r.at::timestamptz, r.at::timestamptz
		FROM jsonb_to_recordset(${json}::jsonb)
			AS r(id text, number int, title text, at text, started text, completed text)
	`);
	await db.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, meta, created_at)
		SELECT ${ulid()}, ${project.rootId}, ${project.id}, r.id, 'navid', 'human', 'ticket.created', '{}'::jsonb,
			r.at::timestamptz
		FROM jsonb_to_recordset(${json}::jsonb) AS r(id text, at text)
	`);
	await db.execute(sql`UPDATE projects SET ticket_counter = ${first + options.count - 1} WHERE id = ${project.rootId}`);
	return rows.map((row) => `${project.key}-${row.number}`);
};
