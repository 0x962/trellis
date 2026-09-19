import type { Flow, FlowCreateInput, FlowSummary, FlowUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { upsert } from "../actors.ts";
import { deriveSlug } from "../slug.ts";
import { assertSlugFree, assertVersion, flowColumns, readDoc, resolveFlow } from "./queries.ts";

export const list = (_ctx: ServiceCtx, tx: Tx, _input: Record<string, never>): Promise<FlowSummary[]> =>
	rows<FlowSummary>(
		tx,
		sql`SELECT id, slug, name, description, harness, version,
			${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt",
			(SELECT count(*)::int FROM flow_nodes WHERE flow_nodes.flow_id = flows.id) AS "nodeCount",
			(SELECT count(*)::int FROM flow_edges WHERE flow_edges.flow_id = flows.id) AS "edgeCount"
			FROM flows ORDER BY name, id`,
	);

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
	await upsert(ctx, tx, actor);
	const [flow] = await rows<Flow>(
		tx,
		sql`INSERT INTO flows (id, slug, name, description, created_at, updated_at)
			VALUES (${ulid()}, ${slug}, ${input.name}, ${input.description ?? ""}, ${ctx.now}, ${ctx.now})
			RETURNING ${flowColumns}`,
	);
	ctx.emit({ type: "flows.changed", id: flow!.id });
	return flow!;
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: FlowUpdateInput): Promise<Flow> => {
	const actor = requireActor(ctx);
	const current = await resolveFlow(tx, input.flow);
	assertVersion(current, input.expectedVersion);
	if (input.slug !== undefined && input.slug !== current.slug) await assertSlugFree(tx, input.slug);
	await upsert(ctx, tx, actor);
	const [flow] = await rows<Flow>(
		tx,
		sql`UPDATE flows SET name = COALESCE(${input.name ?? null}, name), slug = COALESCE(${input.slug ?? null}, slug),
			description = COALESCE(${input.description ?? null}, description),
			briefing = COALESCE(${input.briefing ?? null}, briefing),
			harness = CASE WHEN ${input.harness === undefined} THEN harness ELSE ${input.harness ? JSON.stringify(input.harness) : null}::jsonb END,
			version = version + 1, updated_at = ${ctx.now}
			WHERE id = ${current.id} RETURNING ${flowColumns}`,
	);
	ctx.emit({ type: "flows.changed", id: current.id });
	return flow!;
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
