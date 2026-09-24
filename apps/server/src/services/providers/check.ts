import type { ProviderCheck, ProviderRemoteInput } from "@trellis/api";
import { z } from "zod";
import type { IoCtx } from "../support.ts";
import { cacheOf } from "./cache.ts";
import { type RemoteDeps, readRemote } from "./remote.ts";
import { providerById } from "./rows.ts";
import { keyOf } from "./secret.ts";

const creditsSchema = z.object({ balance: z.string().regex(/^-?\d+(\.\d+)?$/u) });
const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

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
	const gateway = provider.kind === "vercel-ai-gateway";
	const result = readRemote(
		ctx,
		{ baseUrl: provider.baseUrl, apiKey: provider.apiKey, path: gateway ? "credits" : "models" },
		(body) => {
			if (gateway) return creditsSchema.parse(body).balance;
			modelsSchema.parse(body);
			return null;
		},
		deps.fetch,
	).then((remote): ProviderCheck => {
		const checkedAt = new Date(deps.now()).toISOString();
		return remote.ok
			? { ok: true, balance: remote.value, detail: null, checkedAt }
			: { ok: false, balance: null, detail: remote.detail, checkedAt };
	});
	cache.check = { at: now, result };
	return result;
};
