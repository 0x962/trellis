import { afterAll, beforeAll, expect, test } from "bun:test";
import { TicketUpdateManyInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create } from "./create.ts";
import { updateDependencies } from "./deps.ts";
import { update } from "./update.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const projectId = ulid();
const statusId = ulid();
const labelIds = Array.from({ length: 51 }, () => ulid());
const dependencyIds = Array.from({ length: 201 }, () => ulid());
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	ctx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-29T20:00:00Z"),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, ticket_counter, created_at, updated_at)
		VALUES (${projectId}, 'COL', 'col', 'Collections', 201, ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO labels (id, project_id, name, color, created_at, updated_at) VALUES
		${sql.join(
			labelIds.map((id, index) => sql`(${id}, ${projectId}, ${`Label ${index}`}, 'gray', ${ctx.now}, ${ctx.now})`),
			sql`, `,
		)}`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at) VALUES
		${sql.join(
			dependencyIds.map(
				(id, index) =>
					sql`(${id}, ${projectId}, ${index + 1}, ${`Dependency ${index}`}, ${statusId}, ${index}, ${ctx.now}, ${ctx.now})`,
			),
			sql`, `,
		)}`);
	await run((tx) => ctx.cache.rebuild(tx));
}, 30_000);

afterAll(async () => db.$client.close());

test("ticket writes retain more than 50 labels and deduplicate repeated labels", async () => {
	const created = await run((tx) =>
		create(ctx, tx, {
			project: "COL",
			title: "Complete labels",
			labels: [...labelIds, labelIds[0]!],
		}),
	);
	const readIds = async () => (await run((tx) => ticketGet(tx, created.id))).labels.map((label) => label.id).sort();
	expect(created.labels.map((label) => label.id).sort()).toEqual([...labelIds].sort());
	expect(await readIds()).toEqual([...labelIds].sort());
	await run((tx) => update(ctx, tx, { ticket: created.id, removeLabels: labelIds }));
	expect(await readIds()).toEqual([]);
	await run((tx) => update(ctx, tx, { ticket: created.id, addLabels: labelIds }));
	expect(await readIds()).toEqual([...labelIds].sort());
	expect(
		TicketUpdateManyInputSchema.parse({ tickets: [created.id], addLabels: labelIds, removeLabels: labelIds }),
	).toMatchObject({ addLabels: labelIds, removeLabels: labelIds });
});

test("ticket writes retain, remove, and restore more than 200 dependencies", async () => {
	const created = await run((tx) =>
		create(ctx, tx, {
			project: "COL",
			title: "Complete dependencies",
			after: dependencyIds,
		}),
	);
	const readIds = async () =>
		(await run((tx) => ticketGet(tx, created.id))).waitsOn.map((item) => item.identifier).sort();
	const expected = dependencyIds.map((_, index) => `COL-${index + 1}`).sort();
	expect(await readIds()).toEqual(expected);
	await run((tx) => updateDependencies(ctx, tx, { ticket: created.id, notAfter: dependencyIds }));
	expect(await readIds()).toEqual([]);
	await run((tx) => updateDependencies(ctx, tx, { ticket: created.id, after: dependencyIds }));
	expect(await readIds()).toEqual(expected);
	await expect(
		run((tx) =>
			updateDependencies(ctx, tx, {
				ticket: created.id,
				after: [...dependencyIds, dependencyIds[0]!],
			}),
		),
	).rejects.toThrow("Name each ticket once.");
	await expect(
		run((tx) =>
			updateDependencies(ctx, tx, {
				ticket: created.id,
				notAfter: [...dependencyIds, dependencyIds[0]!],
			}),
		),
	).rejects.toThrow("Name each ticket once.");
	await expect(
		run((tx) =>
			create(ctx, tx, {
				project: "COL",
				title: "Duplicate dependencies",
				after: [...dependencyIds, dependencyIds[0]!],
			}),
		),
	).rejects.toThrow("Name each ticket once.");
	await expect(
		run((tx) =>
			updateDependencies(ctx, tx, {
				ticket: dependencyIds[0]!,
				after: [created.id],
			}),
		),
	).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
	expect(await readIds()).toEqual(expected);
}, 30_000);

test("large collections retain project boundaries and label group rules", async () => {
	const foreignProject = ulid();
	const foreignStatus = ulid();
	const foreignLabel = ulid();
	const foreignTicket = ulid();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${foreignProject}, 'OTH', 'oth', 'Other', ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${foreignStatus}, ${foreignProject}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO labels (id, project_id, name, color, created_at, updated_at)
		VALUES (${foreignLabel}, ${foreignProject}, 'Foreign', 'gray', ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${foreignTicket}, ${foreignProject}, 1, 'Foreign', ${foreignStatus}, 0, ${ctx.now}, ${ctx.now})`);
	await run((tx) => ctx.cache.rebuild(tx));
	const created = await run((tx) => create(ctx, tx, { project: "COL", title: "Boundary checks" }));
	await expect(
		run((tx) =>
			update(ctx, tx, {
				ticket: created.id,
				addLabels: [...labelIds, foreignLabel],
			}),
		),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(
		run((tx) =>
			updateDependencies(ctx, tx, {
				ticket: created.id,
				after: [...dependencyIds, foreignTicket],
			}),
		),
	).rejects.toThrow("A dependency must belong to the same project as its ticket.");
	const groupId = ulid();
	const groupedIds = [ulid(), ulid()];
	await db.execute(sql`INSERT INTO label_groups (id, project_id, name, created_at, updated_at)
		VALUES (${groupId}, ${projectId}, 'Exclusive', ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`INSERT INTO labels (id, project_id, group_id, name, color, created_at, updated_at) VALUES
		${sql.join(
			groupedIds.map(
				(id, index) => sql`(${id}, ${projectId}, ${groupId}, ${`Choice ${index}`}, 'gray', ${ctx.now}, ${ctx.now})`,
			),
			sql`, `,
		)}`);
	await expect(
		run((tx) =>
			update(ctx, tx, {
				ticket: created.id,
				addLabels: [...labelIds, ...groupedIds],
			}),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const stored = await run((tx) => ticketGet(tx, created.id));
	expect(stored.labels).toEqual([]);
	expect(stored.waitsOn).toEqual([]);
});
