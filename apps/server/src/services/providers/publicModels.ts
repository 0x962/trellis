import type { ProviderModels, ProviderPublicModelsInput } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { cacheOf } from "./cache.ts";
import { loadModels } from "./catalog.ts";
import type { RemoteDeps } from "./remote.ts";

export const preparePublicModels = async (
	ctx: IoCtx,
	input: ProviderPublicModelsInput,
	deps: RemoteDeps = { fetch, now: Date.now },
): Promise<ProviderModels> => {
	if (input.kind === "openai-compatible")
		return { ok: true, detail: null, fetchedAt: new Date(deps.now()).toISOString(), models: [] };
	const cache = cacheOf(ctx.home, `kind:${input.kind}`);
	const now = deps.now();
	if (cache.models && now - cache.models.at < (input.refresh ? 1000 : 300_000)) return cache.models.result;
	const result = loadModels(ctx, { kind: input.kind, baseUrl: "https://ai-gateway.vercel.sh" }, deps);
	cache.models = { at: now, result };
	return result;
};
