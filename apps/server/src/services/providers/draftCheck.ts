import { type ProviderCheck, ProviderCheckDraftInputSchema } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import type { RemoteDeps } from "./remote.ts";
import { readProviderCheck } from "./remoteCheck";

export const prepareDraftCheck = (
	ctx: IoCtx,
	rawInput: unknown,
	deps: RemoteDeps = { fetch, now: Date.now },
): Promise<ProviderCheck> => {
	const input = ProviderCheckDraftInputSchema.parse(rawInput);
	return readProviderCheck(ctx, { ...input, baseUrl: input.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "") }, deps);
};
