import type { Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type Change, record } from "./activity.ts";

// Writes the positions 0 to n minus 1 in the order of `ids`.
export const renumber = async (tx: Tx, ids: string[]) => {
	for (const [position, id] of ids.entries()) {
		await tx.execute(sql`UPDATE statuses SET position = ${position} WHERE id = ${id}`);
	}
};

// A name is unique inside a set without letter case, and so is its slug.
// `others` is the set without the status under edit.
export const assertFreeName = (others: Status[], name: string, slug: string) => {
	const lower = name.toLowerCase();
	if (others.some((status) => status.name.toLowerCase() === lower)) throw fail("DUPLICATE", { field: "name" });
	if (others.some((status) => status.slug === slug)) throw fail("DUPLICATE", { field: "slug" });
};

export type StatusInsert = Omit<Status, "createdAt" | "updatedAt">;

export const insertStatus = (ctx: ServiceCtx, tx: Tx, status: StatusInsert) =>
	tx.execute(
		sql`INSERT INTO statuses (id, project_id, name, description, slug, category, color, position, is_default, created_at, updated_at)
			VALUES (${status.id}, ${status.projectId}, ${status.name}, ${status.description}, ${status.slug}, ${status.category},
				${status.color}, ${status.position}, ${status.isDefault}, ${ctx.now}, ${ctx.now})`,
	);

// The set every project starts with, in position order. Todo is the default.
// Each description tells the user what the status means. The migration
// 0006_status_descriptions writes the same texts onto the statuses of a
// database that existed before the descriptions, so a text change here
// needs a new data migration for existing projects.
const STATUS_SEED: Array<Pick<Status, "name" | "description" | "category" | "color" | "isDefault">> = [
	{
		name: "Todo",
		description: "Work has not started.",
		category: "todo",
		color: "fg-muted",
		isDefault: true,
	},
	{
		name: "In Progress",
		description: "Work is in progress.",
		category: "started",
		color: "accent",
		isDefault: false,
	},
	{
		name: "Agent Review",
		description: "An agent reviews the work.",
		category: "review",
		color: "agent",
		isDefault: false,
	},
	{
		name: "Human Review",
		description: "A person reviews the work.",
		category: "review",
		color: "warning",
		isDefault: false,
	},
	{
		name: "Done",
		description: "Work is complete.",
		category: "done",
		color: "success",
		isDefault: false,
	},
	{
		name: "Canceled",
		description: "Work will not continue.",
		category: "canceled",
		color: "fg-faint",
		isDefault: false,
	},
];

export const seedStatuses = async (ctx: ServiceCtx, tx: Tx, projectId: string) => {
	for (const [position, seed] of STATUS_SEED.entries()) {
		await insertStatus(ctx, tx, {
			...seed,
			id: ulid(),
			projectId,
			slug: seed.name.toLowerCase().replace(/ /g, "-"),
			position,
		});
	}
};

// One project-level activity batch on the project that owns the set.
export const statusActivity = (ctx: ServiceCtx, tx: Tx, projectId: string, action: string, changes: Change[]) =>
	record(ctx, tx, { projectId, ticketId: null, action, changes });

export const emitStatusesChanged = (ctx: ServiceCtx, projectId: string) => {
	ctx.emit({ type: "statuses.changed", projectId });
};

// The status `id` as the rebuilt cache holds it.
export const statusById = (ctx: ServiceCtx, projectId: string, id: string) =>
	ctx.cache.statusesOf(projectId).find((status) => status.id === id) as Status;
