import type { ParsedProviderCheckDraftInput, ProviderCheck } from "@trellis/api";
import { z } from "zod";
import type { IoCtx } from "../../support.ts";
import { type RemoteDeps, readRemote } from "../remote.ts";

const creditsSchema = z.object({ balance: z.string().regex(/^-?\d+(\.\d+)?$/u) });
const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export const readProviderCheck = (
	ctx: IoCtx,
	provider: ParsedProviderCheckDraftInput,
	deps: RemoteDeps,
): Promise<ProviderCheck> => {
	const gateway = provider.kind === "vercel-ai-gateway";
	return readRemote(
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
};
