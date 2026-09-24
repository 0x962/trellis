import { type ProviderKind, ProviderModelIdSchema, type ProviderModels } from "@trellis/api";
import { z } from "zod";
import type { IoCtx } from "../support.ts";
import { type RemoteDeps, readRemote } from "./remote.ts";

const gatewayCatalogSchema = z.object({
	data: z.array(z.object({ id: ProviderModelIdSchema, name: z.string(), type: z.string() })),
});
const compatibleCatalogSchema = z.object({
	data: z.array(z.object({ id: ProviderModelIdSchema, name: z.string().optional(), type: z.string().optional() })),
});
const catalog = (body: unknown, kind: ProviderKind) =>
	(kind === "vercel-ai-gateway" ? gatewayCatalogSchema : compatibleCatalogSchema)
		.parse(body)
		.data.filter((model) => model.type === "language" || (kind === "openai-compatible" && model.type === undefined))
		.map((model) => ({ id: model.id, name: model.name ?? model.id, type: "language" as const }))
		.sort((a, b) => a.id.localeCompare(b.id));

export const loadModels = async (
	ctx: IoCtx,
	provider: { baseUrl: string; kind: ProviderKind; apiKey?: string },
	deps: RemoteDeps,
): Promise<ProviderModels> => {
	const remote = await readRemote(
		ctx,
		{ ...provider, path: "models" },
		(body) => catalog(body, provider.kind),
		deps.fetch,
	);
	const fetchedAt = new Date(deps.now()).toISOString();
	return remote.ok
		? { ok: true, detail: null, fetchedAt, models: remote.value }
		: { ok: false, detail: remote.detail, fetchedAt, models: [] };
};
