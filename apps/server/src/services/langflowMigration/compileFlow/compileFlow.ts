import { isDeepStrictEqual } from "node:util";
import type { FlowDiagnosticV1, FlowDoc, FlowNode } from "@trellis/api";
import { z } from "zod";
import { documentBytes } from "../../flowDocuments";
import type { compilerCatalog } from "../compilerCatalog";
import { compilerGraph } from "../compilerGraph";
import type { CompiledSourceNode, CompilerHarness, CompilerObject, ConversionCompilerInput } from "../conversionCompilerTypes";
import type { ConversionAssociationV1, ConversionExpansionV1 } from "../conversionIntakeTypes";

const harnessSchema = z.strictObject({
	preset: z.string().min(1), startCommand: z.string().min(1), resumeCommand: z.string().min(1),
	model: z.string().min(1), effort: z.string().min(1),
});

export const compileFlow = (
	doc: FlowDoc, input: ConversionCompilerInput, catalog: ReturnType<typeof compilerCatalog>,
) => {
	const graph = compilerGraph(catalog);
	const nodeSpecs: ConversionAssociationV1[] = [];
	const nativeSpecs: CompilerObject = {};
	const reviewSpecs: CompilerObject = {};
	const sourceAssociations: Record<string, string[]> = {};
	const edgeAssociations: Record<string, string[]> = {};
	const scopes: CompilerObject = {};
	const diagnostics: FlowDiagnosticV1[] = [];
	const compiled = new Map<string, CompiledSourceNode>();
	const sourceNodes = new Map(doc.nodes.map((node) => [node.id, node]));
	const fail = (code: string, nodeId: string, message: string) => {
		diagnostics.push({ code, message, severity: "error", path: ["nodes", nodeId] });
	};
	const position = (source: FlowNode) => {
		let { x, y, parentId } = source;
		while (parentId !== null) {
			const parent = sourceNodes.get(parentId)!;
			x += parent.x;
			y += parent.y;
			parentId = parent.parentId;
		}
		if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("conversion_position_overflow");
		return { ...source, x, y };
	};
	const create = (source: FlowNode, id: string, className: string, values: CompilerObject = {}) => {
		const created = graph.create(position(source), id, className, values);
		(sourceAssociations[source.id] ??= []).push(id);
		return created;
	};
	const native = (source: FlowNode, id: string, phase: "step" | "children" | "condition") => {
		const human = source.kind === "human";
		const created = create(source, id, human ? "TrellisHumanDecisionV1" : "TrellisNativeAgentV1");
		let harness: CompilerHarness | null = null;
		if (!human) {
			const inherited = source.harness ?? doc.flow.harness;
			const policy = input.nativePolicies[source.id];
			const parsed = harnessSchema.safeParse(policy?.harness);
			if (!policy || !parsed.success || !isDeepStrictEqual(inherited, policy.sourceHarness) ||
				(inherited !== null && Object.entries(inherited).some(([key, value]) => policy.harness[key as keyof typeof policy.harness] !== value))) {
				fail("conversion_native_policy_unresolved", source.id, "An immutable policy must resolve the exact inherited harness, commands, model, and effort.");
			} else harness = structuredClone(policy.harness);
		}
		nativeSpecs[id] = { nodeId: source.id, taskKeyBase: source.id, name: source.title, instruction: source.instruction, harness };
		nodeSpecs.push({ sourceNodeId: source.id, engineNodeId: id, definitionId: created.definitionId, phase, specNamespace: "trellisRequestSpecsV1" });
		return created.node;
	};
	const sourceEdge = (edge: FlowDoc["edges"][number]) => {
		const from = compiled.get(edge.fromNodeId)!;
		const to = compiled.get(edge.toNodeId)!;
		const output = from.outputs[edge.branch];
		if (!output) throw new Error("conversion_branch_port_unavailable");
		graph.connect(edge.id, output, to.input);
		edgeAssociations[edge.id] = [edge.id];
	};
	const group = (source: FlowNode): CompiledSourceNode => {
		const children = doc.nodes.filter((node) => node.parentId === source.id);
		for (const child of children) compile(child);
		const ids = children.map((node) => node.id);
		const childSet = new Set(ids);
		const internal = doc.edges.filter((edge) => childSet.has(edge.fromNodeId) && childSet.has(edge.toNodeId));
		const incoming = new Set(internal.map((edge) => edge.toNodeId));
		const outgoing = new Set(internal.map((edge) => edge.fromNodeId));
		const entryIds = source.parallel ? ids : ids.filter((id) => !incoming.has(id));
		const terminalIds = source.parallel ? ids : ids.filter((id) => !outgoing.has(id));
		const scope = create(source, `${source.id}:scope`, "TrellisGroupScopeV1").node;
		const output = create(source, `${source.id}:output`, "TrellisGroupOutputV1").node;
		const settlements = Object.fromEntries(ids.map((id) => [id, `${source.id}:settle:${id}`]));
		const definition = {
			version: 1, groupNodeId: source.id, parentGroupNodeId: source.parentId,
			scopeVertexId: scope.id, outputVertexId: output.id,
			parallel: source.parallel, minutes: source.minutes, childNodeIds: ids,
			childVertices: Object.fromEntries(ids.map((id) => {
				const child = compiled.get(id)!;
				return [id, {
					inputVertexId: child.input.node.id, outputVertexId: (child.outputs.out ?? child.outputs.yes)!.node.id,
					settlementSourceVertexId: child.settlement!.node.id,
				}];
			})),
			entryNodeIds: entryIds, terminalNodeIds: terminalIds, settlementVertexIds: settlements, edges: internal,
		};
		graph.set(scope, "scope_definition", documentBytes(definition).toString("utf8"));
		scopes[source.id] = definition;
		graph.connect(`${scope.id}:${output.id}`, { node: scope, port: "entries" }, { node: output, port: "scope_entry" });
		for (const id of entryIds) graph.connect(`${scope.id}:${id}`, { node: scope, port: "entries" }, compiled.get(id)!.scopeInput);
		for (const edge of internal) sourceEdge(edge);
		for (const child of children) {
			const settled = compiled.get(child.id)!.settlement!;
			const settlement = create(child, settlements[child.id]!, "TrellisGroupSettlementV1", { source_node_id: child.id }).node;
			graph.connect(`${child.id}:${settlement.id}`, settled, { node: settlement, port: "result" });
			graph.connect(`${settlement.id}:${output.id}`, { node: settlement, port: "settlement" }, { node: output, port: "settlements" });
		}
		if (source.minutes !== null) fail("conversion_group_deadline_unverified", source.id, "Timed groups require the qualified deadline reservation and launch trace.");
		return { input: { node: scope, port: "boundary_inputs" }, scopeInput: { node: scope, port: "boundary_inputs" }, outputs: { out: { node: output, port: "out" } }, settlement: { node: output, port: "out" } };
	};
	const compile = (source: FlowNode): CompiledSourceNode => {
		let result: CompiledSourceNode;
		if (source.kind === "group") result = group(source);
		else if (source.kind === "loop") {
			const loop = create(source, source.id, "TrellisLoopV1", { max_rounds: source.maxRounds }).node;
			const body = group({ ...source, parallel: false, minutes: null });
			const condition = native(source, `${source.id}:condition`, "condition");
			graph.connect(`${source.id}:children`, { node: loop, port: "children" }, body.input);
			graph.connect(`${source.id}:condition-input`, body.outputs.out!, { node: condition, port: "inputs" });
			graph.connect(`${source.id}:feedback`, { node: condition, port: "result" }, { node: loop, port: "children" }, true);
			result = { input: { node: loop, port: "seed" }, scopeInput: { node: loop, port: "scope_entry" }, outputs: { out: { node: loop, port: "done" } }, settlement: { node: loop, port: "done" } };
		} else if (source.kind === "gate" && source.reviewArea != null) {
			const gate = create(source, source.id, "TrellisReviewGateV1");
			reviewSpecs[source.id] = { nodeId: source.id, reviewArea: source.reviewArea };
			nodeSpecs.push({ sourceNodeId: source.id, engineNodeId: source.id, definitionId: gate.definitionId, phase: source.parentId === null ? "step" : "children", specNamespace: "trellisReviewGatesV1" });
			result = { input: { node: gate.node, port: "inputs" }, scopeInput: { node: gate.node, port: "inputs" }, outputs: { yes: { node: gate.node, port: "yes" }, no: { node: gate.node, port: "no" } }, settlement: null };
		} else {
			const node = native(source, source.id, source.parentId === null ? "step" : "children");
			const receipt = { node, port: "result" };
			result = { input: { node, port: "inputs" }, scopeInput: { node, port: "inputs" }, outputs: { out: receipt }, settlement: receipt };
			if (source.kind === "gate") {
				const decision = create(source, `${source.id}:decision`, "TrellisNativeDecisionV1").node;
				graph.connect(`${source.id}:decision`, receipt, { node: decision, port: "result" });
				result.outputs = { yes: { node: decision, port: "yes" }, no: { node: decision, port: "no" } };
			}
		}
		compiled.set(source.id, result);
		return result;
	};
	for (const node of doc.nodes.filter((node) => node.parentId === null)) compile(node);
	for (const edge of doc.edges.filter((edge) => sourceNodes.get(edge.fromNodeId)!.parentId === null)) sourceEdge(edge);
	const expansion: ConversionExpansionV1 = {
		graphDocument: z.record(z.string(), z.json()).parse({
			nodes: graph.nodes, edges: graph.edges, trellisSource: doc,
			trellisRequestSpecsV1: nativeSpecs, trellisReviewGatesV1: reviewSpecs,
			sourceAssociations, edgeAssociations, groupScopes: scopes,
		}), nodeSpecs,
	};
	return {
		expansion: diagnostics.some((item) => item.code === "conversion_native_policy_unresolved") ? null : expansion,
		diagnostics,
	};
};
