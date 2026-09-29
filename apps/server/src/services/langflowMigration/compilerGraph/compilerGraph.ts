import type { FlowNode } from "@trellis/api";
import { z } from "zod";
import { documentBytes } from "../../flowDocuments";
import type { compilerCatalog } from "../compilerCatalog";
import type { CompilerEndpoint, CompilerJson, CompilerNode, CompilerObject } from "../conversionCompilerTypes";

const object = z.record(z.string(), z.json());
const outputSchema = z.looseObject({ name: z.string(), types: z.array(z.string()).min(1), selected: z.string().nullish(), allows_loop: z.boolean().optional(), loop_types: z.array(z.string()).nullish() });
const inputSchema = z.looseObject({ type: z.string(), input_types: z.array(z.string()), proxy: z.json().optional() });
const escape = (handle: CompilerObject) => documentBytes(handle).toString("utf8").replaceAll('"', "œ");

export const compilerGraph = (catalog: ReturnType<typeof compilerCatalog>) => {
	const nodes: CompilerNode[] = [];
	const edges: CompilerObject[] = [];
	const definitions = new Map(catalog.templates?.definitions.map((entry) => [entry.className, entry]) ?? []);
	const create = (source: FlowNode, id: string, className: string, values: CompilerObject = {}) => {
		const definition = definitions.get(className);
		if (!definition) throw new Error(`conversion_definition_unavailable:${className}`);
		const native = structuredClone(definition.frontendTemplate.data.node);
		const fields = object.parse(native.template);
		for (const [key, value] of Object.entries(values)) {
			const field = object.parse(fields[key]);
			if (key === "code" || !Object.hasOwn(field, "value")) throw new Error(`conversion_field_unavailable:${className}.${key}`);
			fields[key] = { ...field, value };
		}
		native.template = fields;
		const node: CompilerNode = {
			id, type: "genericNode", position: { x: source.x, y: source.y },
			data: { id, type: className, node: native, showNode: true },
		};
		nodes.push(node);
		return { node, definitionId: definition.id };
	};
	const outputHandle = ({ node, port }: CompilerEndpoint, feedback = false): CompilerObject => {
		const output = z.array(outputSchema).parse(node.data.node.outputs).find((item) => item.name === port);
		if (!output || (feedback && !output.allows_loop)) throw new Error(`conversion_output_unavailable:${node.id}.${port}`);
		return {
			output_types: [output.selected ?? output.types[0]!, ...(feedback ? output.loop_types ?? [] : [])],
			id: node.id, dataType: node.data.type, name: port,
		};
	};
	const connect = (id: string, source: CompilerEndpoint, target: CompilerEndpoint, feedback = false) => {
		const sourceHandle = outputHandle(source);
		let targetHandle: CompilerObject;
		if (feedback) targetHandle = outputHandle(target, true);
		else {
			const fields = object.parse(target.node.data.node.template);
			const field = inputSchema.parse(fields[target.port]);
			targetHandle = { inputTypes: field.input_types, type: field.type, id: target.node.id, fieldName: target.port,
				...(field.proxy === undefined ? {} : { proxy: field.proxy }) };
		}
		edges.push({ id, source: source.node.id, target: target.node.id, sourceHandle: escape(sourceHandle), targetHandle: escape(targetHandle),
			data: { sourceHandle, targetHandle } });
	};
	const set = (node: CompilerNode, name: string, value: CompilerJson) => {
		const fields = object.parse(node.data.node.template);
		const field = object.parse(fields[name]);
		if (name === "code" || !Object.hasOwn(field, "value")) throw new Error(`conversion_field_unavailable:${node.id}.${name}`);
		fields[name] = { ...field, value };
		node.data.node.template = fields;
	};
	return { nodes, edges, create, connect, set };
};
