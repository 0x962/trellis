import { z } from "zod";
import type { ListedModel } from "../types.ts";

// `codex app-server` speaks JSON-RPC over stdio, one message per line. It
// exits when stdin closes, so the caller keeps stdin open until the
// `model/list` answer arrives.
export const CODEX_MODELS_ARGS = ["app-server"];
const LIST_ID = 2;
export const CODEX_MODELS_REQUESTS = `${[
	{
		id: 1,
		method: "initialize",
		params: { clientInfo: { name: "trellis_host", version: "1" }, capabilities: { experimentalApi: true } },
	},
	{ method: "initialized" },
	{ id: LIST_ID, method: "model/list", params: {} },
]
	.map((message) => JSON.stringify(message))
	.join("\n")}\n`;

const envelope = z.looseObject({ id: z.union([z.number(), z.string()]).optional() });
const answer = z.looseObject({
	error: z.unknown().optional(),
	result: z
		.looseObject({
			data: z.array(z.looseObject({ id: z.string(), displayName: z.string(), hidden: z.boolean().optional() })),
		})
		.optional(),
});

// The models of the `model/list` answer, or null when `text` is any other
// message. A hidden model stays out of the codex picker, so it stays out
// of this list.
export const parseCodexModelsLine = (text: string): ListedModel[] | null => {
	if (!text.startsWith("{")) return null;
	const message = JSON.parse(text);
	if (envelope.parse(message).id !== LIST_ID) return null;
	const parsed = answer.parse(message);
	if (parsed.error !== undefined) throw new Error(`codex did not list its models: ${JSON.stringify(parsed.error)}`);
	return parsed
		.result!.data.filter((model) => model.hidden !== true)
		.map((model) => ({ name: model.id, label: model.displayName }));
};
