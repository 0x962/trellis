import type { Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { statusColumns, toStatus } from "../db/queries/effectiveStatuses.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type Change, record } from "./activity.ts";
import { remapScope } from "./statusRemap.ts";

// The rows a project owns, in position order, read from the database. The
// cache lags the writes of the open transaction; this does not.
export const ownedStatuses = async (tx: Tx, projectId: string): Promise<Status[]> => {
	const found = await rows<Parameters<typeof toStatus>[0]>(
		tx,
		sql`SELECT ${statusColumns} FROM statuses s WHERE s.project_id = ${projectId} ORDER BY s.position, s.id`,
	);
	return found.map(toStatus);
};

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
		sql`INSERT INTO statuses (id, project_id, name, description, slug, category, reviewer, color, position, wip_limit, is_default, created_at, updated_at)
			VALUES (${status.id}, ${status.projectId}, ${status.name}, ${status.description}, ${status.slug}, ${status.category},
				${status.reviewer}, ${status.color}, ${status.position}, ${status.wipLimit}, ${status.isDefault}, ${ctx.now}, ${ctx.now})`,
	);

// Gives an inheriting project its own copy of the effective set: new ids,
// every other column equal. Then the tickets of its scope move onto the
// copies. After this the project is owner(P) for its subtree.
export const materialize = async (ctx: ServiceCtx, tx: Tx, projectId: string) => {
	const { statuses } = ctx.cache.effectiveStatuses(projectId);
	for (const status of statuses) {
		await insertStatus(ctx, tx, { ...status, id: ulid(), projectId });
	}
	await remapScope(ctx, tx, { projectId, toOwnerId: projectId });
};

// Each root starts with these statuses in this order. Todo is the default.
// The review statuses identify the reviewer. Each description explains the work in that status.
const ROOT_SEED: Array<Pick<Status, "name" | "description" | "category" | "reviewer" | "color" | "isDefault">> = [
	{
		name: "Todo",
		description: "Work awaits its start. Clarify the requirements before work starts.",
		category: "todo",
		reviewer: null,
		color: "fg-muted",
		isDefault: true,
	},
	{
		name: "In Progress",
		description: "Work on this ticket is in progress.",
		category: "started",
		reviewer: null,
		color: "accent",
		isDefault: false,
	},
	{
		name: "Agent Review",
		description: "The pull request awaits an agent review.",
		category: "review",
		reviewer: "agent",
		color: "agent",
		isDefault: false,
	},
	{
		name: "Human Review",
		description: "The pull request awaits a human review.",
		category: "review",
		reviewer: "human",
		color: "warning",
		isDefault: false,
	},
	{
		name: "Done",
		description: "The work is complete.",
		category: "done",
		reviewer: null,
		color: "success",
		isDefault: false,
	},
	{
		name: "Canceled",
		description: "Work on this ticket is canceled.",
		category: "canceled",
		reviewer: null,
		color: "fg-faint",
		isDefault: false,
	},
];

export const seedRootStatuses = async (ctx: ServiceCtx, tx: Tx, projectId: string) => {
	for (const [position, seed] of ROOT_SEED.entries()) {
		await insertStatus(ctx, tx, {
			...seed,
			id: ulid(),
			projectId,
			slug: seed.name.toLowerCase().replace(/ /g, "-"),
			position,
			wipLimit: null,
		});
	}
};

// One project-level activity batch on the owner of the set.
export const statusActivity = (ctx: ServiceCtx, tx: Tx, ownerId: string, action: string, changes: Change[]) =>
	record(ctx, tx, { rootId: ctx.cache.get(ownerId).rootId, projectId: ownerId, ticketId: null, action, changes });

export const emitStatusesChanged = (ctx: ServiceCtx, projectId: string) => {
	ctx.emit({ type: "statuses.changed", projectId });
};

// The status `id` as the rebuilt cache holds it.
export const statusById = (ctx: ServiceCtx, ownerId: string, id: string) =>
	ctx.cache.effectiveStatuses(ownerId).statuses.find((status) => status.id === id) as Status;
