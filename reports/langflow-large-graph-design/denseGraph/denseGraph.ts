import type { z } from "zod";
import {
	type LangflowGraphDocumentSchema,
	langflowGraphFixture,
} from "../../../integrations/langflow/editor-probe/src/langflowGraphFixture.ts";

type Graph = z.infer<typeof LangflowGraphDocumentSchema>;
type Node = Graph["nodes"][number];
type Field = { value: string | number | string[]; list: boolean };

export const denseGraphCases = [
	{ name: "required-density", nodeCount: 500, edgeCount: 2000, roundCount: 50 },
	{ name: "beyond-former-cutoffs", nodeCount: 501, edgeCount: 2001, roundCount: 51 },
] as const;

export type DenseGraphCase = (typeof denseGraphCases)[number];

const nodeId = (index: number) => `dense-${String(index).padStart(4, "0")}`;
const fieldsOf = (node: Node) => node.data.node.template as Record<string, Field>;
const escapeHandle = (handle: Record<string, string | string[]>) =>
	JSON.stringify(Object.fromEntries(Object.entries(handle).sort(([a], [b]) => a.localeCompare(b)))).replaceAll(
		'"',
		"œ",
	);

export function createDenseGraphFixture(dimensions: DenseGraphCase) {
	const nodes: Node[] = Array.from({ length: dimensions.nodeCount }, (_, index) => {
		const template = structuredClone(langflowGraphFixture.nodes[index % langflowGraphFixture.nodes.length]!);
		const id = nodeId(index);
		const node: Node = {
			...template,
			id,
			type: "genericNode",
			data: { ...template.data, id },
			position: { x: (index % 20) * 360, y: Math.floor(index / 20) * 340 },
		};
		const fields = fieldsOf(node);
		fields.name!.value = `Step ${index + 1}`;
		if (fields.instruction) fields.instruction.value = "Read the complete instruction. ".repeat(4096);
		if (fields.question) fields.question.value = "Does this occurrence satisfy its instruction?";
		if (fields.children) fields.children.value = [];
		if (fields.areas) fields.areas.value = ["correctness", "security"];
		if (fields.maximumRounds) fields.maximumRounds.value = dimensions.roundCount;
		return node;
	});

	const identities = {
		correctness: nodeId(0),
		backend: nodeId(1),
		human: nodeId(3),
		reviewGroup: nodeId(4),
		branchGroup: nodeId(5),
		outerLoop: nodeId(6),
		innerLoop: nodeId(13),
	};
	fieldsOf(nodes[3]!).name!.value = "Release Decision";
	fieldsOf(nodes[6]!).children!.value = [identities.innerLoop];
	fieldsOf(nodes[13]!).children!.value = [identities.reviewGroup];
	fieldsOf(nodes[4]!).children!.value = [identities.branchGroup, identities.human];
	fieldsOf(nodes[5]!).children!.value = [identities.correctness, identities.backend];

	const listInputs = nodes.flatMap((node) =>
		Object.entries(fieldsOf(node))
			.filter(([, field]) => field.list)
			.map(([fieldName]) => ({ node, fieldName })),
	);
	const edges = Array.from({ length: dimensions.edgeCount }, (_, index) => {
		const source = nodes[index % nodes.length]!;
		const candidates = listInputs.filter(({ node }) => node.id !== source.id);
		const target = candidates[(index % nodes.length + Math.floor(index / nodes.length)) % candidates.length]!;
		const sourceHandle = {
			dataType: source.data.type,
			id: source.id,
			name: "result",
			output_types: ["Text"],
		};
		const targetHandle = {
			fieldName: target.fieldName,
			id: target.node.id,
			inputTypes: ["Text"],
			type: "str",
		};
		return {
			id: `dense-edge-${index}`,
			type: "default",
			source: source.id,
			target: target.node.id,
			sourceHandle: escapeHandle(sourceHandle),
			targetHandle: escapeHandle(targetHandle),
			data: { sourceHandle, targetHandle },
		};
	});

	return {
		dimensions,
		identities,
		graph: { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.75 } } satisfies Graph,
		outline: [
			{ nodeId: identities.outerLoop, parentId: null, title: "Release" },
			{ nodeId: identities.innerLoop, parentId: identities.outerLoop, title: "Review rounds" },
			{ nodeId: identities.reviewGroup, parentId: identities.innerLoop, title: "Review steps" },
			{ nodeId: identities.branchGroup, parentId: identities.reviewGroup, title: "Review branches" },
			{ nodeId: identities.correctness, parentId: identities.branchGroup, title: "Correctness" },
			{ nodeId: identities.backend, parentId: identities.branchGroup, title: "Backend" },
			{ nodeId: identities.human, parentId: identities.reviewGroup, title: "Release Decision" },
		],
	};
}
