import type { InputFieldType } from "@/types/api";

const managed = new Set([
	"code", "seed", "wait_bytes", "scope_definition", "source_node_id", "child_ids",
	"request_spec", "request_bytes", "spec_hash", "source_node_hash",
]);

export function fieldPolicy(name: string, field: Partial<InputFieldType>, sourceBound: boolean) {
	if (managed.has(name)) return "This field belongs to the saved flow contract.";
	if (sourceBound) return "This field requires an update to the original flow and its bindings.";
	if (field.readonly || field.load_from_db || field.dynamic || field.refresh_button || field.real_time_refresh) {
		return "The installed component manages this field.";
	}
	if (field.input_types?.length || field.list || !["str", "string", "bool", "int", "float"].includes(field.type ?? "")) {
		return "Use the declared ports for this field.";
	}
	return null;
}
