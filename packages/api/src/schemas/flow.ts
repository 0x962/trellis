import { z } from "zod";
import { CountSchema, IsoDateTimeSchema, slugPattern, UlidSchema } from "./primitives.ts";

// A flow is a graph of agent steps that trellis runs against a target, such
// as a pull request. Each node is one step. Each edge sends the result of one
// node to the next node. A node with two outgoing edges starts two nodes at
// the same time. A node with two incoming edges waits for both and reads both
// results.
//
// - `agent` runs one agent and returns its result.
// - `gate` runs one agent that answers YES or NO. Its `yes` edges run on YES,
//   and its `no` edges run on NO.
// - `human` waits until a person approves or rejects its input.
// - `budget` is a group with a time limit in `minutes`. When the time runs
//   out, every unfinished node inside it fails.
// - `loop` is a group that runs its nodes as one round, then asks its exit
//   question. It runs `maxRounds` rounds at most.
//
// A node inside a group names the group in `parentId`. Its `x` and `y` are relative to the
// top left corner of that group. A node outside every group places `x` and
// `y` on the canvas. An edge connects two
// nodes of the same group, or two nodes outside every group.
export const FlowNodeKindSchema = z.enum(["agent", "gate", "human", "budget", "loop"]);
export type FlowNodeKind = z.infer<typeof FlowNodeKindSchema>;

export const flowGroupKinds: ReadonlySet<FlowNodeKind> = new Set(["budget", "loop"]);

// The kinds that run an agent, and so take a persona or an instruction.
export const flowAgentKinds: ReadonlySet<FlowNodeKind> = new Set(["agent", "gate", "loop"]);

// The output of a node that an edge leaves from. A gate has `yes` and `no`.
// Every other kind has `out`.
export const FlowBranchSchema = z.enum(["out", "yes", "no"]);
export type FlowBranch = z.infer<typeof FlowBranchSchema>;

export const FLOW_MAX_MINUTES = 1440;
export const FLOW_MAX_ROUNDS = 50;
export const FLOW_MAX_NODES = 500;
export const FLOW_MAX_EDGES = 2000;
// A canvas coordinate. The bound keeps a lost drag from storing a position
// that no viewport can reach.
const CoordinateSchema = z.number().min(-1_000_000).max(1_000_000);
// The drawn size of a group box. A card sizes itself, so a card keeps null.
const SizeSchema = z.number().min(40).max(100_000);

// `minutes` belongs to a budget and `maxRounds` belongs to a loop. Each kind
// carries its own number and no other.
const numbersMatchKind = (node: { kind: FlowNodeKind; minutes: number | null; maxRounds: number | null }) =>
	(node.kind === "budget") === (node.minutes !== null) && (node.kind === "loop") === (node.maxRounds !== null);

export const FlowNodeInputSchema = z
	.strictObject({
		id: UlidSchema,
		parentId: UlidSchema.nullable(),
		kind: FlowNodeKindSchema,
		title: z.string().trim().min(1, "Write a title.").max(120),
		personaId: UlidSchema.nullable(),
		instruction: z.string().max(200_000),
		minutes: z.number().int().min(1).max(FLOW_MAX_MINUTES).nullable(),
		maxRounds: z.number().int().min(1).max(FLOW_MAX_ROUNDS).nullable(),
		x: CoordinateSchema,
		y: CoordinateSchema,
		width: SizeSchema.nullable(),
		height: SizeSchema.nullable(),
	})
	.refine(numbersMatchKind, "A budget needs minutes, a loop needs maxRounds, and no other kind takes either.");
export type FlowNodeInput = z.input<typeof FlowNodeInputSchema>;

export const FlowEdgeInputSchema = z.strictObject({
	id: UlidSchema,
	fromNodeId: UlidSchema,
	toNodeId: UlidSchema,
	branch: FlowBranchSchema,
});
export type FlowEdgeInput = z.input<typeof FlowEdgeInputSchema>;

export const FlowNodeSchema = z.object({
	id: UlidSchema,
	parentId: UlidSchema.nullable(),
	kind: FlowNodeKindSchema,
	title: z.string(),
	personaId: UlidSchema.nullable(),
	instruction: z.string(),
	minutes: z.number().int().nullable(),
	maxRounds: z.number().int().nullable(),
	x: z.number(),
	y: z.number(),
	width: z.number().nullable(),
	height: z.number().nullable(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z.object({
	id: UlidSchema,
	fromNodeId: UlidSchema,
	toNodeId: UlidSchema,
	branch: FlowBranchSchema,
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

// `briefing` is the text every agent of the flow reads before its own
// instruction. `version` rises on every change to the flow or its graph.
export const FlowSchema = z.object({
	id: UlidSchema,
	slug: z.string(),
	name: z.string(),
	description: z.string(),
	briefing: z.string(),
	version: z.number().int().positive(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Flow = z.infer<typeof FlowSchema>;

export const FlowSummarySchema = FlowSchema.omit({ briefing: true }).extend({
	nodeCount: CountSchema,
	edgeCount: CountSchema,
});
export type FlowSummary = z.infer<typeof FlowSummarySchema>;

export const FlowDocSchema = z.object({
	flow: FlowSchema,
	nodes: z.array(FlowNodeSchema),
	edges: z.array(FlowEdgeSchema),
});
export type FlowDoc = z.infer<typeof FlowDocSchema>;

// A flow slug names the flow in a URL, such as `/ai/flows/review`.
export const FlowSlugSchema = z
	.string()
	.max(64)
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// A flow ref is its ULID or its slug.
export const FlowRefSchema = z.string().min(1).max(64);

export const FlowCreateInputSchema = z.strictObject({
	name: z.string().trim().min(1).max(120),
	slug: FlowSlugSchema.optional(),
	description: z.string().trim().max(2000).optional(),
});
export type FlowCreateInput = z.input<typeof FlowCreateInputSchema>;

export const FlowUpdateInputSchema = z.strictObject({
	flow: FlowRefSchema,
	name: z.string().trim().min(1).max(120).optional(),
	slug: FlowSlugSchema.optional(),
	description: z.string().trim().max(2000).optional(),
	briefing: z.string().max(200_000).optional(),
	expectedVersion: z.number().int().positive().optional(),
});
export type FlowUpdateInput = z.input<typeof FlowUpdateInputSchema>;

// The whole graph of one flow. A save replaces every node and edge of the
// flow with these. A client mints the ULID of a new node, so an edge can name
// the node in the same save.
export const FlowSaveInputSchema = z.strictObject({
	flow: FlowRefSchema,
	nodes: z.array(FlowNodeInputSchema).max(FLOW_MAX_NODES),
	edges: z.array(FlowEdgeInputSchema).max(FLOW_MAX_EDGES),
	expectedVersion: z.number().int().positive().optional(),
});
export type FlowSaveInput = z.input<typeof FlowSaveInputSchema>;

export const FlowGetInputSchema = z.strictObject({ flow: FlowRefSchema });
export const FlowDeleteInputSchema = z.strictObject({ flow: FlowRefSchema });
export const FlowDeleteOutputSchema = z.object({ id: UlidSchema });
