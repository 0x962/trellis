import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { openTestDb } from "../testDb.ts";
import { withTx } from "../tx.ts";
import { timeline } from "./timeline.ts";

const rootId = "01J00000000000000000000000";
const statusId = "01J00000000000000000000001";
const ticketId = "01J00000000000000000000002";
const at = "2026-09-17T12:00:00.000Z";

let db: Db;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`
		INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, 'TRL', 'trellis', 'Trellis', ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'gray', 0, true, ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${rootId}, 1, 'Timeline test', ${statusId}, 1, ${at}, ${at})
	`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("the ticket timeline hides position, pull request check and comment changes", async () => {
	await db.execute(sql`
		INSERT INTO activity (batch_id, project_id, ticket_id, actor_name, actor_kind, action, field, from_value, to_value, meta, created_at)
		VALUES
			('01J00000000000000000000003', ${rootId}, ${ticketId}, 'trellis', 'system', 'ticket.created', NULL, NULL, NULL, '{}'::jsonb, '2026-09-17T12:00:01.000Z'),
			('01J00000000000000000000004', ${rootId}, ${ticketId}, 'trellis', 'system', 'ticket.updated', 'position', '1', '2', '{}'::jsonb, '2026-09-17T12:00:02.000Z'),
			('01J00000000000000000000005', ${rootId}, ${ticketId}, 'trellis', 'system', 'pr.state_changed', NULL, NULL, NULL, '{"from":"open/pending","to":"open/pass"}'::jsonb, '2026-09-17T12:00:03.000Z'),
			('01J00000000000000000000006', ${rootId}, ${ticketId}, 'trellis', 'system', 'pr.state_changed', NULL, NULL, NULL, '{"from":"open/pass","to":"merged/pass"}'::jsonb, '2026-09-17T12:00:04.000Z'),
			('01J00000000000000000000007', ${rootId}, ${ticketId}, 'trellis', 'system', 'comment.created', NULL, NULL, NULL, '{"commentId":"01J00000000000000000000008"}'::jsonb, '2026-09-17T12:00:05.000Z')
	`);

	const { result } = await withTx(db, (tx) => timeline(tx, { ticketId }));

	expect(result.items.map((item) => [item.action, item.meta])).toEqual([
		["pr.state_changed", { from: "open/pass", to: "merged/pass" }],
		["ticket.created", {}],
	]);
});
