import { z } from "zod";
import type { ListedModel } from "../types.ts";

// `claude -p` in stream-json mode takes control requests on stdin. The
// `initialize` request answers with the model picker of the account.
export const CLAUDE_MODELS_ARGS = [
	"-p",
	"--input-format",
	"stream-json",
	"--output-format",
	"stream-json",
	"--verbose",
];
const REQUEST_ID = "trellis-models";
export const CLAUDE_MODELS_REQUEST = `${JSON.stringify({
	type: "control_request",
	request_id: REQUEST_ID,
	request: { subtype: "initialize" },
})}\n`;

const line = z.looseObject({
	type: z.string(),
	response: z
		.looseObject({
			request_id: z.string(),
			subtype: z.string(),
			error: z.string().optional(),
			response: z
				.looseObject({ models: z.array(z.looseObject({ value: z.string(), displayName: z.string() })) })
				.optional(),
		})
		.optional(),
});

// The `default` entry stands for the model claude picks on its own. A blank
// trellis model setting means the same thing, so the list leaves it out.
export const parseClaudeModels = (stdout: string): ListedModel[] => {
	for (const text of stdout.split("\n")) {
		if (!text.startsWith("{")) continue;
		const parsed = line.parse(JSON.parse(text));
		if (parsed.type !== "control_response" || parsed.response?.request_id !== REQUEST_ID) continue;
		if (parsed.response.subtype !== "success")
			throw new Error(`claude did not list its models: ${parsed.response.error}`);
		return parsed.response
			.response!.models.filter((model) => model.value !== "default")
			.map((model) => ({ name: model.value, label: model.displayName }));
	}
	throw new Error(`claude did not answer the initialize request: ${stdout.trim()}`);
};
