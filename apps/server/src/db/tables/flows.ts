import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { checkIn, FLOW_BRANCHES, FLOW_NODE_KINDS } from "../enums.ts";
import { at } from "./actors.ts";

// A flow is a graph of agent steps. `version` rises on every change to the
// flow row or to any of its nodes and edges, so a client that saves with an
// old version gets FLOW_VERSION_CONFLICT.
export const flows = pgTable(
	"flows",
	{
		id: text().primaryKey(),
		slug: text().notNull(),
		name: text().notNull(),
		description: text().notNull().default(""),
		briefing: text().notNull().default(""),
		// The FlowHarness of every step that names none. NULL means claude.
		harness: jsonb(),
		version: integer().notNull().default(1),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("flows_slug_unique").on(t.slug),
		check("flows_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${t.slug}) <= 64`),
		check("flows_name_check", sql`length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} ~ '[^[:space:]]'`),
		check("flows_description_check", sql`length(${t.description}) <= 2000`),
		check("flows_briefing_check", sql`length(${t.briefing}) <= 200000`),
		check("flows_version_check", sql`${t.version} > 0`),
	],
);

// One step of a flow. A node inside a group or a loop names that group in
// `parent_id`. The composite foreign key keeps the group inside the same
// flow, and the delete of a group deletes every node inside it. The service
// checks that the parent is a group kind, because a CHECK cannot read the
// kind of another row. `x` and `y` are relative to the group that holds the node. `width`
// and `height` are the drawn size of a group box, and NULL for a card.
export const flowNodes = pgTable(
	"flow_nodes",
	{
		id: text().primaryKey(),
		flowId: text("flow_id")
			.notNull()
			.references(() => flows.id, { onDelete: "cascade" }),
		parentId: text("parent_id"),
		kind: text().notNull(),
		title: text().notNull(),
		instruction: text().notNull().default(""),
		parallel: boolean().notNull().default(false),
		minutes: integer(),
		maxRounds: integer("max_rounds"),
		// The FlowHarness of a step that runs an agent. NULL takes the harness of the flow.
		harness: jsonb(),
		x: doublePrecision().notNull(),
		y: doublePrecision().notNull(),
		width: doublePrecision(),
		height: doublePrecision(),
	},
	(t) => [
		unique("flow_nodes_id_flow_id_unique").on(t.id, t.flowId),
		foreignKey({
			name: "flow_nodes_parent_fk",
			columns: [t.parentId, t.flowId],
			foreignColumns: [t.id, t.flowId],
		}).onDelete("cascade"),
		check("flow_nodes_parent_check", sql`${t.parentId} <> ${t.id}`),
		checkIn(t.kind, FLOW_NODE_KINDS),
		check("flow_nodes_title_check", sql`length(${t.title}) <= 120`),
		check("flow_nodes_instruction_check", sql`length(${t.instruction}) <= 200000`),
		check(
			"flow_nodes_minutes_check",
			sql`(${t.kind} = 'group' OR ${t.minutes} IS NULL) AND (${t.minutes} IS NULL OR ${t.minutes} BETWEEN 1 AND 1440)`,
		),
		check("flow_nodes_parallel_check", sql`${t.kind} = 'group' OR ${t.parallel} = false`),
		check("flow_nodes_harness_check", sql`${t.kind} IN ('agent', 'gate', 'loop') OR ${t.harness} IS NULL`),
		check(
			"flow_nodes_max_rounds_check",
			sql`(${t.kind} = 'loop') = (${t.maxRounds} IS NOT NULL) AND (${t.maxRounds} IS NULL OR ${t.maxRounds} BETWEEN 1 AND 50)`,
		),
		check(
			"flow_nodes_size_check",
			sql`(${t.width} IS NULL OR ${t.width} >= 40) AND (${t.height} IS NULL OR ${t.height} >= 40)`,
		),
		index("flow_nodes_flow_id_idx").on(t.flowId),
	],
);

// One connection from an output of a node to another node of the same flow.
// `branch` is the output: `yes` or `no` for a gate, `out` for every other
// kind. The service checks the branch against the kind and rejects a loop of
// edges, because a CHECK cannot read other rows.
export const flowEdges = pgTable(
	"flow_edges",
	{
		id: text().primaryKey(),
		flowId: text("flow_id")
			.notNull()
			.references(() => flows.id, { onDelete: "cascade" }),
		fromNodeId: text("from_node_id").notNull(),
		toNodeId: text("to_node_id").notNull(),
		branch: text().notNull().default("out"),
	},
	(t) => [
		foreignKey({
			name: "flow_edges_from_fk",
			columns: [t.fromNodeId, t.flowId],
			foreignColumns: [flowNodes.id, flowNodes.flowId],
		}).onDelete("cascade"),
		foreignKey({
			name: "flow_edges_to_fk",
			columns: [t.toNodeId, t.flowId],
			foreignColumns: [flowNodes.id, flowNodes.flowId],
		}).onDelete("cascade"),
		unique("flow_edges_from_node_id_branch_to_node_id_unique").on(t.fromNodeId, t.branch, t.toNodeId),
		check("flow_edges_not_self_check", sql`${t.fromNodeId} <> ${t.toNodeId}`),
		checkIn(t.branch, FLOW_BRANCHES),
		index("flow_edges_flow_id_idx").on(t.flowId),
		index("flow_edges_to_node_id_idx").on(t.toNodeId),
	],
);
