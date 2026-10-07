import type { ProviderCheck, ProviderRemoteInput } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { cacheOf } from "./cache.ts";
import type { RemoteDeps } from "./remote.ts";
import { readProviderCheck } from "./remoteCheck";
import { providerById } from "./rows.ts";
import { keyOf } from "./secret.ts";

export const prepareCheck = async (
	ctx: IoCtx,
	input: ProviderRemoteInput,
	deps: RemoteDeps = { fetch, now: Date.now },
): Promise<ProviderCheck> => {
	const { cache, provider } = await ctx.newTx(async (tx) => {
		const row = await providerById(tx, input.id);
		const apiKey = await keyOf(tx, input.id);
		return { cache: cacheOf(ctx.home, input.id), provider: { ...row, apiKey } };
	});
	const now = deps.now();
	if (cache.check && now - cache.check.at < (input.refresh ? 1000 : 30_000)) return cache.check.result;
	const result = readProviderCheck(ctx, provider, deps);
	cache.check = { at: now, result };
	return result;
};
