import { invalidInput } from "../../../../errors.ts";
import type { Templates } from "./schemas.ts";

type Data = Templates["definitions"][number]["frontendTemplate"]["data"];
const object = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const restore = (target: Record<string, unknown>, source: Record<string, unknown>, key: string) => {
	if (Object.hasOwn(source, key)) target[key] = source[key];
	else delete target[key];
};
const invalid = () => invalidInput("graphDocument", "The component differs from its installed template.");

export function normalizeNode(data: Data, installed: Data): Data {
	const normalized = structuredClone(data);
	normalized.id = installed.id;
	if (Object.hasOwn(data, "showNode")) {
		if (typeof data.showNode !== "boolean") throw invalid();
		restore(normalized, installed, "showNode");
	}
	if (Object.hasOwn(data, "selected_output")) {
		if (
			typeof data.selected_output !== "string" ||
			!installed.node.outputs.some((output) => output.name === data.selected_output)
		)
			throw invalid();
		restore(normalized, installed, "selected_output");
	}
	for (const key of ["display_name", "description"]) {
		if (Object.hasOwn(normalized.node, key)) {
			if (typeof normalized.node[key] !== "string") throw invalid();
			restore(normalized.node, installed.node, key);
		}
	}
	for (const [name, spec] of Object.entries(installed.node.template)) {
		const supplied = normalized.node.template[name];
		if (name === "code" || !object(spec) || !object(supplied)) continue;
		if (Object.hasOwn(spec, "value")) {
			if (!Object.hasOwn(supplied, "value")) throw invalid();
			if (
				["minutes", "max_rounds"].includes(name) &&
				supplied.value !== null &&
				(typeof supplied.value !== "number" || !Number.isSafeInteger(supplied.value) || supplied.value <= 0)
			)
				throw invalid();
			restore(supplied, spec, "value");
		}
		for (const key of ["advanced", "password"]) {
			if (!Object.hasOwn(supplied, key) || (key === "password" && !Object.hasOwn(spec, key))) continue;
			if (typeof supplied[key] !== "boolean") throw invalid();
			restore(supplied, spec, key);
		}
	}
	if (normalized.node.outputs.length !== installed.node.outputs.length) throw invalid();
	for (const [index, output] of normalized.node.outputs.entries()) {
		const original = installed.node.outputs[index]!;
		if (
			Object.hasOwn(output, "selected") &&
			output.selected !== original.selected &&
			(typeof output.selected !== "string" ||
				!Array.isArray(original.types) ||
				!original.types.includes(output.selected))
		)
			throw invalid();
		restore(output, original, "selected");
	}
	return normalized;
}
