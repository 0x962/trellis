import type { ProviderModels, ProviderRemoteInput } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { cacheOf } from "./cache.ts";
import { loadModels } from "./catalog.ts";
import type { RemoteDeps } from "./remote.ts";
import { providerById } from "./rows.ts";
import { keyOf } from "./secret.ts";

export const prepareModels = async (
	ctx: IoCtx,
	input: ProviderRemoteInput,
	deps: RemoteDeps = { fetch, now: Date.now },
): Promise<ProviderModels> => {
	const { cache, provider } = await ctx.newTx(async (tx) => {
		const row = await providerById(tx, input.id);
		return {
			cache: cacheOf(ctx.home, input.id),
			provider: {
				baseUrl: row.baseUrl,
				kind: row.kind,
				apiKey: row.kind === "openai-compatible" ? await keyOf(tx, row.id) : undefined,
			},
		};
	});
	const now = deps.now();
	if (cache.models && now - cache.models.at < (input.refresh ? 1000 : 300_000)) return cache.models.result;
	const result = loadModels(ctx, provider, deps);
	cache.models = { at: now, result };
	return result;
};
