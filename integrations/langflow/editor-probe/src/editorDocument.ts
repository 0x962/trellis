import { z } from "zod";

export const componentKinds = [
	"agent",
	"native-gate",
	"jev-gate",
	"human",
	"ordered-group",
	"parallel-group",
	"loop",
] as const;

export type ComponentKind = (typeof componentKinds)[number];

export const inspectorFields = {
	agent: ["name", "instruction", "harness", "model", "effort", "accountSource"],
	"native-gate": ["name", "question", "harness", "model", "effort"],
	"jev-gate": ["name", "question", "areas"],
	human: ["name", "question", "approveLabel", "rejectLabel"],
	"ordered-group": ["name", "deadlineMinutes", "children"],
	"parallel-group": ["name", "deadlineMinutes", "children"],
	loop: ["name", "exitQuestion", "maximumRounds", "children"],
} as const satisfies Record<ComponentKind, readonly string[]>;

const EditorNodeSchema = z.strictObject({
	id: z.string().min(1),
	type: z.enum(componentKinds),
	position: z.strictObject({ x: z.number(), y: z.number() }),
	data: z.strictObject({
		label: z.string().min(1),
		config: z.record(z.string(), z.json()),
	}),
});

const EditorEdgeSchema = z.strictObject({
	id: z.string().min(1),
	source: z.string().min(1),
	sourceOutput: z.string().min(1),
	target: z.string().min(1),
	targetInput: z.string().min(1),
});

export const EditorGraphDocumentSchema = z.strictObject({
	data: z.strictObject({
		nodes: z.array(EditorNodeSchema),
		edges: z.array(EditorEdgeSchema),
	}),
});

export type EditorGraphDocument = z.infer<typeof EditorGraphDocumentSchema>;

export function connectWithKeyboard(
	document: EditorGraphDocument,
	connection: Omit<EditorGraphDocument["data"]["edges"][number], "id">,
): EditorGraphDocument {
	const id = `${connection.source}:${connection.sourceOutput}:${connection.target}:${connection.targetInput}`;
	return {
		data: {
			nodes: document.data.nodes,
			edges: [...document.data.edges, { id, ...connection }],
		},
	};
}
