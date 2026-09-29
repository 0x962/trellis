import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type ComponentKind, componentKinds, inspectorFields } from "./editorDocument.ts";

const displayNames = {
	agent: "Agent",
	"native-gate": "Native gate",
	"jev-gate": "Jev gate",
	human: "Human decision",
	"ordered-group": "Ordered group",
	"parallel-group": "Parallel group",
	loop: "Loop",
} as const satisfies Record<ComponentKind, string>;

const icons = {
	agent: "Bot",
	"native-gate": "ShieldCheck",
	"jev-gate": "ScanSearch",
	human: "UserCheck",
	"ordered-group": "ListOrdered",
	"parallel-group": "GitFork",
	loop: "Repeat2",
} as const satisfies Record<ComponentKind, string>;

const inputField = (name: string) => ({
	advanced: false,
	display_name: name,
	dynamic: false,
	field_type: "str",
	fileTypes: [],
	file_path: "",
	info: "",
	input_types: ["Text"],
	list: name === "areas" || name === "children",
	load_from_db: false,
	multiline: name === "instruction" || name === "question",
	name,
	password: false,
	placeholder: "",
	required: false,
	show: true,
	title_case: false,
	type: name === "deadlineMinutes" || name === "maximumRounds" ? "int" : "str",
	value: name === "deadlineMinutes" || name === "maximumRounds" ? 1 : "",
});

export const langflowGraphFixture = {
	nodes: componentKinds.map((kind, index) => {
		const fields = inspectorFields[kind];
		const id = `${kind}-1`;
		return {
			id,
			type: "genericNode",
			position: { x: (index % 4) * 360, y: Math.floor(index / 4) * 800 },
			data: {
				id,
				type: `Trellis${kind}`,
				node: {
					base_classes: ["Text"],
					beta: false,
					conditional_paths: [],
					custom_fields: {},
					description: `${displayNames[kind]} configuration for the Trellis editor probe.`,
					display_name: displayNames[kind],
					documentation: "",
					edited: false,
					field_order: [...fields],
					frozen: false,
					icon: icons[kind],
					output_types: ["Text"],
					outputs: [
						{
							cache: true,
							display_name: "Result",
							hidden: false,
							method: "result",
							name: "result",
							selected: "Text",
							types: ["Text"],
							value: "__UNDEFINED__",
						},
					],
					pinned: false,
					template: Object.fromEntries(fields.map((field) => [field, inputField(field)])),
				},
			},
		};
	}),
	edges: [],
	viewport: { x: 0, y: 0, zoom: 0.75 },
};

const langflowComponentTypes = componentKinds.map((kind) => `Trellis${kind}`) as [string, ...string[]];

export const LangflowGraphDocumentSchema = z.object({
	nodes: z.array(
		z
			.object({
				id: z.string().min(1),
				type: z.literal("genericNode"),
				position: z.object({ x: z.number(), y: z.number() }),
				data: z.object({
					id: z.string().min(1),
					type: z.enum(langflowComponentTypes),
					node: z.record(z.string(), z.json()),
				}),
			})
			.refine((node) => node.id === node.data.id, {
				message: "The Langflow node identities do not match.",
				path: ["data", "id"],
			}),
	),
	edges: z.array(z.record(z.string(), z.json())),
	viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
});

export const langflowComponentManifest = {
	trellis: Object.fromEntries(
		langflowGraphFixture.nodes.map((node) => [node.data.type, structuredClone(node.data.node)]),
	),
	component_display_names: {},
};

const componentAuthority = (definition: Record<string, unknown>) => {
	const authority = structuredClone(definition);
	if (typeof authority.template !== "object" || authority.template === null || Array.isArray(authority.template)) {
		return authority;
	}
	for (const field of Object.values(authority.template)) {
		if (typeof field === "object" && field !== null && !Array.isArray(field)) {
			delete (field as Record<string, unknown>).value;
		}
	}
	return authority;
};

export const matchesPinnedLangflowComponentAuthority = (graphDocument: z.infer<typeof LangflowGraphDocumentSchema>) =>
	graphDocument.nodes.every((node) => {
		const pinned = langflowComponentManifest.trellis[node.data.type];
		return pinned !== undefined && isDeepStrictEqual(componentAuthority(node.data.node), componentAuthority(pinned));
	});
