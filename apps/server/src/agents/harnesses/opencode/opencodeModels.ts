import type { ListedModel } from "../types.ts";

// `opencode models` prints one `provider/model` per line, which is the form
// its `--model` flag takes.
export const OPENCODE_MODELS_ARGS = ["models"];

export const parseOpenCodeModels = (stdout: string): ListedModel[] => {
	const models = stdout
		.split("\n")
		.map((text) => text.trim())
		.filter((text) => text !== "")
		.map((text) => ({ name: text, label: text }));
	if (models.length === 0) throw new Error("opencode listed no models");
	return models;
};
