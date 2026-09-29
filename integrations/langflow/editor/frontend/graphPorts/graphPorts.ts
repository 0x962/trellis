import { computeDisplayHandle } from "@/CustomNodes/GenericNode/components/RenderInputParameters/utils";
import type { AllNodeType } from "@/types/flow";
import { scapedJSONStringfy } from "@/utils/reactflowUtils";

export type EditorPort = { handle: string; label: string; field: string };
export function graphPorts(node: AllNodeType) {
	const inputs: EditorPort[] = [];
	const outputs: EditorPort[] = [];
	for (const [name, field] of Object.entries(node.data.node?.template ?? {})) {
		if (name === "code" || typeof field !== "object" || field === null || !computeDisplayHandle(field, false)) continue;
		const handle = { inputTypes: field.input_types, type: field.type, id: node.id, fieldName: name,
			...(field.proxy ? { proxy: field.proxy } : {}) };
		inputs.push({ handle: scapedJSONStringfy(handle), field: name,
			label: `${field.display_name || name} (${field.input_types?.join(", ") || field.type})` });
	}
	for (const output of node.data.node?.outputs ?? []) {
		const selected = output.selected ?? output.types[0];
		const handle = { output_types: [selected], id: node.id, dataType: node.data.type, name: output.name };
		outputs.push({ handle: scapedJSONStringfy(handle), field: output.name,
			label: `${output.display_name || output.name} (${selected})` });
		if (output.allows_loop) inputs.push({
			handle: scapedJSONStringfy({ ...handle, output_types: [selected, ...(output.loop_types ?? [])] }),
			field: output.name, label: `${output.display_name || output.name}: feedback (${selected})`,
		});
	}
	return { inputs, outputs };
}
