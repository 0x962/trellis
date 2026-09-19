import { type Flow, type FlowDoc, type FlowEdge, type FlowNode, ulidPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

export const flowColumns = sql`id, slug, name, description, briefing, harness, version,
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

const nodeColumns = sql`id, parent_id AS "parentId", kind, title, instruction,
	parallel, minutes, max_rounds AS "maxRounds", harness, x, y, width, height`;

const edgeColumns = sql`id, from_node_id AS "fromNodeId", to_node_id AS "toNodeId", branch`;

// A flow ref is a ULID in any letter case, or a slug. A value that reads as
// a ULID names the id.
export const resolveFlow = async (tx: Tx, ref: string): Promise<Flow> => {
	const [flow] = ulidPattern.test(ref.toUpperCase())
		? await rows<Flow>(tx, sql`SELECT ${flowColumns} FROM flows WHERE id = ${ref.toUpperCase()}`)
		: await rows<Flow>(tx, sql`SELECT ${flowColumns} FROM flows WHERE slug = ${ref.toLowerCase()}`);
	if (flow === undefined) throw fail("NOT_FOUND", { kind: "flow", ref });
	return flow;
};

// Nodes and edges sort by id. A client mints each id as a ULID when the
// person adds the row, so the order is the order of creation.
export const readDoc = async (tx: Tx, flow: Flow): Promise<FlowDoc> => {
	const nodes = await rows<FlowNode>(
		tx,
		sql`SELECT ${nodeColumns} FROM flow_nodes WHERE flow_id = ${flow.id} ORDER BY id`,
	);
	const edges = await rows<FlowEdge>(
		tx,
		sql`SELECT ${edgeColumns} FROM flow_edges WHERE flow_id = ${flow.id} ORDER BY id`,
	);
	return { flow, nodes, edges };
};

// A mutation that sends `expectedVersion` applies only to that version.
export const assertVersion = (flow: Flow, expectedVersion: number | undefined) => {
	if (expectedVersion !== undefined && expectedVersion !== flow.version)
		throw fail("FLOW_VERSION_CONFLICT", { version: flow.version });
};

export const assertSlugFree = async (tx: Tx, slug: string) => {
	const [taken] = await rows<{ id: string }>(tx, sql`SELECT id FROM flows WHERE slug = ${slug}`);
	if (taken !== undefined) throw fail("DUPLICATE", { field: "slug" });
};
