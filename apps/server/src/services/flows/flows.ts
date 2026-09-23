import type { Flow, FlowCreateInput, FlowListInput, FlowSummary, FlowUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { upsert } from "../actors.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import { deriveSlug } from "../slug.ts";
import { assertSlugFree, assertVersion, listFlows, readDoc, readFlow, resolveFlow } from "./queries.ts";

// A flow belongs to the root project of a tree, so a ref to a sub-project
// stores the root of that sub-project. An absent ref gives a flow that
// belongs to every project.
const rootOfProject = async (ctx: ServiceCtx, tx: Tx, ref: string | null | undefined): Promise<string | null> =>
	ref === null || ref === undefined ? null : (await resolveProject(ctx, tx, ref)).rootId;

// `ticket` keeps the flows of that ticket's project and the flows that
// belong to every project. Without it the list holds every flow.
export const list = async (ctx: ServiceCtx, tx: Tx, input: FlowListInput): Promise<FlowSummary[]> =>
	listFlows(tx, input.ticket === undefined ? null : (await resolveTicket(ctx, tx, input.ticket)).rootId);

export const get = async (_ctx: ServiceCtx, tx: Tx, input: { flow: string }) =>
	readDoc(tx, await resolveFlow(tx, input.flow));

// A slug from the name takes the first free form of `slug`, `slug-2`,
// `slug-3`, and so on. A slug the caller sends must be free.
const freeSlug = async (tx: Tx, name: string) => {
	const base = deriveSlug(name).slice(0, 60).replace(/-+$/, "");
	const taken = new Set(
		(await rows<{ slug: string }>(tx, sql`SELECT slug FROM flows WHERE slug LIKE ${`${base}%`}`)).map(
			(row) => row.slug,
		),
	);
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
	return slug;
};

export const create = async (ctx: ServiceCtx, tx: Tx, input: FlowCreateInput): Promise<Flow> => {
	const actor = requireActor(ctx);
	if (input.slug !== undefined) await assertSlugFree(tx, input.slug);
	const slug = input.slug ?? (await freeSlug(tx, input.name));
	const projectId = await rootOfProject(ctx, tx, input.project);
	await upsert(ctx, tx, actor);
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
			VALUES (${id}, ${projectId}, ${slug}, ${input.name}, ${input.description ?? ""}, ${ctx.now}, ${ctx.now})`,
	);
	ctx.emit({ type: "flows.changed", id });
	return readFlow(tx, id);
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: FlowUpdateInput): Promise<Flow> => {
	const actor = requireActor(ctx);
	const current = await resolveFlow(tx, input.flow);
	assertVersion(current, input.expectedVersion);
	if (input.slug !== undefined && input.slug !== current.slug) await assertSlugFree(tx, input.slug);
	const projectId = await rootOfProject(ctx, tx, input.project);
	await upsert(ctx, tx, actor);
	await tx.execute(
		sql`UPDATE flows SET name = COALESCE(${input.name ?? null}, name), slug = COALESCE(${input.slug ?? null}, slug),
			description = COALESCE(${input.description ?? null}, description),
			briefing = COALESCE(${input.briefing ?? null}, briefing),
			project_id = CASE WHEN ${input.project === undefined} THEN project_id ELSE ${projectId}::text END,
			harness = CASE WHEN ${input.harness === undefined} THEN harness ELSE ${input.harness ? JSON.stringify(input.harness) : null}::jsonb END,
			version = version + 1, updated_at = ${ctx.now}
			WHERE id = ${current.id}`,
	);
	ctx.emit({ type: "flows.changed", id: current.id });
	return readFlow(tx, current.id);
};

// The delete cascades to every node and edge of the flow.
export const remove = async (ctx: ServiceCtx, tx: Tx, input: { flow: string }) => {
	const actor = requireActor(ctx);
	const flow = await resolveFlow(tx, input.flow);
	await tx.execute(sql`DELETE FROM flows WHERE id = ${flow.id}`);
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "flows.changed", id: flow.id });
	return { id: flow.id };
};
