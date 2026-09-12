import { type Flow, type FlowDoc, type FlowIssue, type FlowSaveInput, validateFlowGraph } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertVersion, flowColumns, readDoc, resolveFlow } from "./queries.ts";

// The input path of the row an issue names, so a client can mark the node or
// the edge. The issue keeps its flow code beside the message.
const pathOf = (input: FlowSaveInput, issue: FlowIssue) => {
	if (issue.nodeId !== undefined) return ["nodes", input.nodes.findIndex((node) => node.id === issue.nodeId)];
	if (issue.edgeId !== undefined) return ["edges", input.edges.findIndex((edge) => edge.id === issue.edgeId)];
	return ["nodes"];
};

// Replaces every node and edge of the flow with the input, in one
// transaction. The rows of the flow go first, so a node the input omits is
// gone and a node it keeps takes the new fields. Postgres checks each
// foreign key after a whole INSERT statement, so a node may come before the
// group that holds it.
export const save = async (ctx: ServiceCtx, tx: Tx, input: FlowSaveInput): Promise<FlowDoc> => {
	const actor = requireActor(ctx);
	const current = await resolveFlow(tx, input.flow);
	assertVersion(current, input.expectedVersion);
	const issues = validateFlowGraph(input, "save");
	if (issues.length > 0)
		throw fail("INPUT_VALIDATION_FAILED", {
			issues: issues.map((issue) => ({ message: issue.message, path: pathOf(input, issue), code: issue.code })),
		});

	const personaIds = [...new Set(input.nodes.flatMap((node) => (node.personaId === null ? [] : [node.personaId])))];
	const known = new Set(
		(await rows<{ id: string }>(tx, sql`SELECT id FROM personas WHERE id = ANY(${textArray(personaIds)})`)).map(
			(row) => row.id,
		),
	);
	const missing = input.nodes.flatMap((node, index) =>
		node.personaId !== null && !known.has(node.personaId)
			? [{ message: "The persona does not exist.", path: ["nodes", index, "personaId"] }]
			: [],
	);
	if (missing.length > 0) throw fail("INPUT_VALIDATION_FAILED", { issues: missing });

	// Node and edge ids are global primary keys. An id another flow holds would
	// fail the INSERT, so it is refused here with a code the client can read.
	const ids = textArray([...input.nodes.map((node) => node.id), ...input.edges.map((edge) => edge.id)]);
	const [taken] = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM flow_nodes WHERE id = ANY(${ids}) AND flow_id <> ${current.id}
			UNION ALL SELECT id FROM flow_edges WHERE id = ANY(${ids}) AND flow_id <> ${current.id} LIMIT 1`,
	);
	if (taken !== undefined) throw fail("DUPLICATE", { field: "id" });

	await tx.execute(sql`DELETE FROM flow_edges WHERE flow_id = ${current.id}`);
	await tx.execute(sql`DELETE FROM flow_nodes WHERE flow_id = ${current.id}`);
	if (input.nodes.length > 0)
		await tx.execute(
			sql`INSERT INTO flow_nodes (id, flow_id, parent_id, kind, title, persona_id, instruction, parallel, minutes, max_rounds, x, y, width, height)
				VALUES ${sql.join(
					input.nodes.map(
						(node) =>
							sql`(${node.id}, ${current.id}, ${node.parentId}, ${node.kind}, ${node.title}, ${node.personaId}, ${node.instruction},
							${node.parallel ?? false}, ${node.minutes}, ${node.maxRounds}, ${node.x}, ${node.y}, ${node.width}, ${node.height})`,
					),
					sql`, `,
				)}`,
		);
	if (input.edges.length > 0)
		await tx.execute(
			sql`INSERT INTO flow_edges (id, flow_id, from_node_id, to_node_id, branch)
				VALUES ${sql.join(
					input.edges.map(
						(edge) => sql`(${edge.id}, ${current.id}, ${edge.fromNodeId}, ${edge.toNodeId}, ${edge.branch})`,
					),
					sql`, `,
				)}`,
		);
	const [flow] = await rows<Flow>(
		tx,
		sql`UPDATE flows SET version = version + 1, updated_at = ${ctx.now} WHERE id = ${current.id} RETURNING ${flowColumns}`,
	);
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "flows.changed", id: current.id });
	return readDoc(tx, flow!);
};
