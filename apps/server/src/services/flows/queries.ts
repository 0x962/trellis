import { type Flow, type FlowDoc, type FlowEdge, type FlowNode, type FlowSummary, ulidPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

// The key of a flow's project lives on the projects table, so every read of
// a flow joins it. `p.key` is null for a flow that belongs to every project.
const summaryColumns = sql`f.id, p.key AS "projectKey", f.slug, f.name, f.description, f.harness, f.version,
	${iso(sql`f.created_at`)} AS "createdAt", ${iso(sql`f.updated_at`)} AS "updatedAt"`;

// A summary leaves the briefing out, because a briefing holds up to 200,000
// characters and a list draws none of it.
const flowColumns = sql`${summaryColumns}, f.briefing`;

const flowFrom = sql`FROM flows f LEFT JOIN projects p ON p.id = f.project_id`;

// A write returns the id, and this reads the written row back with the key
// of its project.
export const readFlow = async (tx: Tx, id: string): Promise<Flow> => {
	const [flow] = await rows<Flow>(tx, sql`SELECT ${flowColumns} ${flowFrom} WHERE f.id = ${id}`);
	return flow!;
};

// The flows a project asks for: the flows of that project and the flows that
// belong to every project. A null `rootId` lists every flow of the server.
export const listFlows = (tx: Tx, rootId: string | null): Promise<FlowSummary[]> =>
	rows<FlowSummary>(
		tx,
		sql`SELECT ${summaryColumns},
			(SELECT count(*)::int FROM flow_nodes WHERE flow_nodes.flow_id = f.id) AS "nodeCount",
			(SELECT count(*)::int FROM flow_edges WHERE flow_edges.flow_id = f.id) AS "edgeCount"
			${flowFrom}
			WHERE ${rootId === null ? sql`true` : sql`f.project_id IS NULL OR f.project_id = ${rootId}`}
			ORDER BY f.name, f.id`,
	);

const nodeColumns = sql`id, parent_id AS "parentId", kind, title, instruction,
	parallel, minutes, max_rounds AS "maxRounds", harness, x, y, width, height`;

const edgeColumns = sql`id, from_node_id AS "fromNodeId", to_node_id AS "toNodeId", branch`;

// A flow ref is a ULID in any letter case, or a slug. A value that reads as
// a ULID names the id.
export const resolveFlow = async (tx: Tx, ref: string): Promise<Flow> => {
	const [flow] = ulidPattern.test(ref.toUpperCase())
		? await rows<Flow>(tx, sql`SELECT ${flowColumns} ${flowFrom} WHERE f.id = ${ref.toUpperCase()}`)
		: await rows<Flow>(tx, sql`SELECT ${flowColumns} ${flowFrom} WHERE f.slug = ${ref.toLowerCase()}`);
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
