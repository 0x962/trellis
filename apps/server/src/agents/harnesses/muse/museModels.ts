import { z } from "zod";
import type { ListedModel } from "../types.ts";

// `muse serve` speaks the Muse Session Protocol over stdio, one JSON-RPC
// message per line. `model/list` is a query: it answers the catalog of the
// signed-in account without a session, so no agent run starts here.
export const MUSE_MODELS_ARGS = ["serve"];

const result = z.looseObject({
	models: z.array(z.looseObject({ modelId: z.string(), displayLabel: z.string() })),
});

export const parseMuseModels = (answer: unknown): ListedModel[] =>
	result.parse(answer).models.map((model) => ({ name: model.modelId, label: model.displayLabel }));
