import { type Ticket, TicketCreateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveProject, resolveStatus, resolveTicket } from "../refs.ts";
import { addDependencies } from "./deps.ts";
import { createTicketLabels } from "./labels.ts";
import { type Placement, resolvePlacement } from "./placement.ts";
import { lastPosition } from "./position.ts";
import { outsideProject } from "./rules.ts";

// The next number of the project. The counter lives on the project row and
// the UPDATE locks it, so two creates that run at once get two numbers. A
// deleted ticket leaves its number unused for good.
const nextNumber = async (tx: Tx, projectId: string) => {
	const found = await rows<{ ticket_counter: number }>(
		tx,
		sql`UPDATE projects SET ticket_counter = ticket_counter + 1
			WHERE id = ${projectId} RETURNING ticket_counter`,
	);
	return (found[0] as { ticket_counter: number }).ticket_counter;
};

// A new ticket starts outside every epic and every wave.
const unplaced: Placement = { epicId: null, epicRef: null, waveId: null, waveRef: null };

// The markdown a new ticket of this project starts with.
const ticketTemplate = async (tx: Tx, projectId: string) => {
	const found = await rows<{ ticket_template: string }>(
		tx,
		sql`SELECT ticket_template FROM projects WHERE id = ${projectId}`,
	);
	return (found[0] as { ticket_template: string }).ticket_template;
};

// Creates a ticket in a project. The status defaults to the project's
// default status, the description to the project's ticket template, and the
// position to the end of the status column. A ticket created outside the
// todo category starts at once; one created done or canceled completes at once.
export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketCreateInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	assertProjectActive(ctx, project.id);
	const statuses = ctx.cache.statusesOf(project.id);
	const status =
		input.status === undefined
			? (statuses.find((candidate) => candidate.isDefault) as (typeof statuses)[number])
			: await resolveStatus(ctx, tx, { projectId: project.id, status: input.status });
	const parent = input.parent === undefined ? null : await resolveTicket(ctx, tx, input.parent);
	if (parent !== null && outsideProject(parent, project.id)) throw fail("CROSS_PROJECT_LINK");
	const placement = await resolvePlacement(ctx, tx, project.id, unplaced, input);

	const batchId = ulid();
	const number = await nextNumber(tx, project.id);
	const position = await lastPosition(tx, status.id, null);
	const id = ulid();
	const description = input.description ?? (await ticketTemplate(tx, project.id));
	const priority = input.priority ?? "none";
	const startedAt = status.category === "todo" ? null : ctx.now;
	const completedAt = status.category === "done" || status.category === "canceled" ? ctx.now : null;
	await tx.execute(
		sql`INSERT INTO tickets (id, project_id, number, title, description, priority, status_id, parent_id,
				epic_id, wave_id, position, version, started_at, completed_at, created_at, updated_at)
			VALUES (${id}, ${project.id}, ${number}, ${input.title}, ${description}, ${priority},
				${status.id}, ${parent?.id ?? null}, ${placement.epicId}, ${placement.waveId}, ${position}, 1, ${startedAt},
				${completedAt}, ${ctx.now}, ${ctx.now})`,
	);
	const dependencies =
		input.after === undefined ? [] : await addDependencies(ctx, tx, await resolveTicket(ctx, tx, id), input.after);
	const labels =
		input.labels === undefined
			? 0
			: await createTicketLabels(ctx, tx, { ticketId: id, projectId: project.id, refs: input.labels });
	await record(ctx, tx, {
		projectId: project.id,
		ticketId: id,
		action: "ticket.created",
		batchId,
		changes: [{ field: null, from: null, to: null }],
	});

	const fields = [
		"title",
		"description",
		"priority",
		"status",
		"project",
		...(parent === null ? [] : ["parent"]),
		...(placement.epicId === null ? [] : ["epic"]),
		...(placement.waveId === null ? [] : ["wave"]),
		...(labels === 0 ? [] : ["labels"]),
		...(dependencies.length === 0 ? [] : ["after"]),
	];
	ctx.emit({ type: "ticket.created", summary: await ticketSummary(tx, id), fields, batchId });
	return ticketGet(tx, id);
};
