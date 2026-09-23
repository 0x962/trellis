import { z } from "zod";
import { effortForHarness, HarnessEffortSchema } from "../harness/effort/effort.ts";
import { HARNESS_DEFAULT_MODELS, HarnessPresetSchema } from "../harness/harness.ts";
import { ModelIdSchema } from "../models/models.ts";
import { ProjectRefStringSchema, TicketRefStringSchema } from "../refs.ts";
import { CountSchema, IsoDateTimeSchema, KeySchema, slugPattern, UlidSchema } from "./primitives.ts";

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
// - `group` holds steps. `parallel` starts all children together; otherwise
//   edges set their order. Optional `minutes` limits the whole group.
// - `loop` is a group that runs its nodes as one round, then asks its exit
//   question. It runs `maxRounds` rounds at most.
//
// A connected group starts at one child. A parallel group connects only at
// its boundary; its children have no edges between them.
// A node inside a group names the group in `parentId`. Its `x` and `y` are relative to the
// top left corner of that group. A node outside every group places `x` and
// `y` on the canvas. An edge connects two
// nodes of the same group, or two nodes outside every group.
export const FlowNodeKindSchema = z.enum(["agent", "gate", "human", "group", "loop"]);
export type FlowNodeKind = z.infer<typeof FlowNodeKindSchema>;

export const flowGroupKinds: ReadonlySet<FlowNodeKind> = new Set(["group", "loop"]);

// The kinds that run an agent and need an instruction.
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

// The harness of a step that runs an agent, or of a whole flow. A step with
// null takes the harness of its flow, and a flow with null takes claude. The
// commands of a preset come from HARNESS_PRESETS at launch, so neither
// stores a command, and neither takes the custom preset.
export const FlowHarnessSchema = z
	.strictObject({
		preset: HarnessPresetSchema.exclude(["custom"]),
		model: ModelIdSchema.optional(),
		effort: HarnessEffortSchema.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.effort === undefined) return;
		const model = value.model ?? HARNESS_DEFAULT_MODELS[value.preset];
		if (!effortForHarness(value.preset, model)?.options.some((option) => option.value === value.effort))
			ctx.addIssue({
				code: "custom",
				path: ["effort"],
				message: "Select an effort supported by this harness and model.",
			});
	});
export type FlowHarness = z.infer<typeof FlowHarnessSchema>;

// Only a step that runs an agent takes a harness.
const harnessMatchesKind = (node: { kind: FlowNodeKind; harness: FlowHarness | null }) =>
	node.harness === null || flowAgentKinds.has(node.kind);

// Only a group takes optional minutes or parallel mode. A loop requires maxRounds.
const numbersMatchKind = (node: {
	kind: FlowNodeKind;
	parallel: boolean;
	minutes: number | null;
	maxRounds: number | null;
}) =>
	(node.kind === "group" || (node.minutes === null && !node.parallel)) &&
	(node.kind === "loop") === (node.maxRounds !== null);

export const FlowNodeInputSchema = z
	.strictObject({
		id: UlidSchema,
		parentId: UlidSchema.nullable(),
		kind: FlowNodeKindSchema,
		title: z.string().max(120, "Enter a step title of 120 characters or less."),
		instruction: z.string().max(200_000, "Enter a step instruction of 200,000 characters or less."),
		parallel: z.boolean().default(false),
		minutes: z.number().int().min(1).max(FLOW_MAX_MINUTES).nullable(),
		maxRounds: z.number().int().min(1).max(FLOW_MAX_ROUNDS).nullable(),
		x: CoordinateSchema,
		y: CoordinateSchema,
		width: SizeSchema.nullable(),
		height: SizeSchema.nullable(),
		harness: FlowHarnessSchema.nullable().default(null),
	})
	.refine(numbersMatchKind, "Only a group takes minutes or parallel mode. A loop requires maxRounds.")
	.refine(harnessMatchesKind, "Only an agent, a gate, or a loop takes a harness.");
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
	instruction: z.string(),
	parallel: z.boolean(),
	minutes: z.number().int().nullable(),
	maxRounds: z.number().int().nullable(),
	x: z.number(),
	y: z.number(),
	width: z.number().nullable(),
	height: z.number().nullable(),
	harness: FlowHarnessSchema.nullable(),
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
// instruction. `harness` is the harness of every step that names none.
// `version` rises on every change to the flow or its graph.
//
// `projectKey` is the key of the project the flow belongs to, such as `TRL`.
// `trellis ready` asks a pull request for the flows of its ticket's project.
// A flow with `null` belongs to every project, and every pull request is
// asked for it.
export const FlowSchema = z.object({
	id: UlidSchema,
	projectKey: KeySchema.nullable(),
	slug: z.string(),
	name: z.string(),
	description: z.string(),
	briefing: z.string(),
	harness: FlowHarnessSchema.nullable(),
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

// The project a flow belongs to, in the words every surface prints.
export const flowScope = (flow: Pick<Flow, "projectKey">): string => flow.projectKey ?? "Every project";

// The sentence that says what a flow is for. A flow whose description is
// empty falls back to its name, so every caller shows the same words.
export const flowPurpose = (flow: Pick<FlowSummary, "name" | "description">): string =>
	flow.description.trim() === "" ? flow.name : flow.description.trim();

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

const FlowNameSchema = z
	.string()
	.trim()
	.min(1, "Enter a flow name of 1 to 120 characters.")
	.max(120, "Enter a flow name of 1 to 120 characters.");

const FlowDescriptionSchema = z.string().trim().max(2000, "Enter a flow description of 2000 characters or less.");

export const FlowCreateInputSchema = z.strictObject({
	name: FlowNameSchema,
	slug: FlowSlugSchema.optional(),
	description: FlowDescriptionSchema.optional(),
	// An absent project gives a flow that belongs to every project.
	project: ProjectRefStringSchema.optional(),
});
export type FlowCreateInput = z.input<typeof FlowCreateInputSchema>;

export const FlowUpdateInputSchema = z.strictObject({
	flow: FlowRefSchema,
	name: FlowNameSchema.optional(),
	slug: FlowSlugSchema.optional(),
	description: FlowDescriptionSchema.optional(),
	briefing: z.string().max(200_000).optional(),
	// null gives the flow to every project; an absent field keeps its project.
	project: ProjectRefStringSchema.nullable().optional(),
	// null clears the harness of the flow; an absent field keeps it.
	harness: FlowHarnessSchema.nullable().optional(),
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

// `ticket` keeps the flows of that ticket's project and the flows that
// belong to every project. Without it the list holds every flow.
export const FlowListInputSchema = z.strictObject({ ticket: TicketRefStringSchema.optional() });
export type FlowListInput = z.infer<typeof FlowListInputSchema>;

export const FlowGetInputSchema = z.strictObject({ flow: FlowRefSchema });
export const FlowDeleteInputSchema = z.strictObject({ flow: FlowRefSchema });
export const FlowDeleteOutputSchema = z.object({ id: UlidSchema });
