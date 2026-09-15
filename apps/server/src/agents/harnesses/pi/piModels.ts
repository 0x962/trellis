import type { HarnessModel } from "@trellis/api";

// `pi --list-models` prints a table with a `provider` column and a `model`
// column, two or more spaces apart. The `--model` flag of pi takes
// `provider/model`, and a model id can hold its own slash.
export const PI_MODELS_ARGS = ["--list-models"];

export const parsePiModels = (output: string): HarnessModel[] => {
	const lines = output.split("\n");
	const header = lines.findIndex((text) => /^provider\s{2,}model\s{2,}/.test(text));
	if (header === -1) throw new Error(`pi listed no models: ${output.trim()}`);
	return lines
		.slice(header + 1)
		.filter((text) => text.trim() !== "")
		.map((text) => {
			const [provider, model] = text.trim().split(/\s{2,}/);
			const value = `${provider}/${model}`;
			return { value, label: value };
		});
};
