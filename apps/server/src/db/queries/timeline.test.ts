import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../client.ts";
import { migrate } from "../migrate.ts";
import { withTx } from "../tx.ts";
import { timeline } from "./timeline.ts";

const rootId = "01J00000000000000000000000";
const statusId = "01J00000000000000000000001";
const ticketId = "01J00000000000000000000002";
const at = "2026-09-17T12:00:00.000Z";

let db: Db;

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(sql`
		INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'TRL', 'trellis', 'Trellis', ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'gray', 0, true, ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${rootId}, ${rootId}, 1, 'Timeline test', ${statusId}, 1, ${at}, ${at})
	`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("the ticket timeline hides position and pull request check changes", async () => {
	await db.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field, from_value, to_value, meta, created_at)
		VALUES
			('01J00000000000000000000003', ${rootId}, ${rootId}, ${ticketId}, 'trellis', 'system', 'ticket.created', NULL, NULL, NULL, '{}'::jsonb, '2026-09-17T12:00:01.000Z'),
			('01J00000000000000000000004', ${rootId}, ${rootId}, ${ticketId}, 'trellis', 'system', 'ticket.updated', 'position', '1', '2', '{}'::jsonb, '2026-09-17T12:00:02.000Z'),
			('01J00000000000000000000005', ${rootId}, ${rootId}, ${ticketId}, 'trellis', 'system', 'pr.state_changed', NULL, NULL, NULL, '{"from":"open/pending","to":"open/pass"}'::jsonb, '2026-09-17T12:00:03.000Z'),
			('01J00000000000000000000006', ${rootId}, ${rootId}, ${ticketId}, 'trellis', 'system', 'pr.state_changed', NULL, NULL, NULL, '{"from":"open/pass","to":"merged/pass"}'::jsonb, '2026-09-17T12:00:04.000Z')
	`);

	const { result } = await withTx(db, (tx) => timeline(tx, { ticketId }));

	expect(result.items.map((item) => (item.kind === "activity" ? [item.action, item.meta] : item.kind))).toEqual([
		["pr.state_changed", { from: "open/pass", to: "merged/pass" }],
		["ticket.created", {}],
	]);
});
