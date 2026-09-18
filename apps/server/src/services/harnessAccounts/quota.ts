import type { HarnessAccountQuota } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { readCredential } from "./credentials.ts";
import { fetchAccountQuota, isCurrentMuseQuota } from "./fetchQuota.ts";
import { type AccountRow, getAccount } from "./queries.ts";

const cache = new Map<string, { at: number; result: Promise<HarnessAccountQuota> }>();
export const prepareQuota = async (
	ctx: IoCtx,
	input: { id: string; refresh?: boolean },
	deps = { load: (account: AccountRow) => fetchAccountQuota(account, fetch, readCredential), now: Date.now },
) => {
	const account = await ctx.newTx((tx) => getAccount(tx, input));
	const key = `${ctx.home}:${account.id}`;
	const saved = cache.get(key);
	const now = deps.now();
	if (saved && now - saved.at < (input.refresh ? 1000 : 30000)) {
		const result = await saved.result;
		if (account.harness !== "muse" || isCurrentMuseQuota(result, now)) return result;
	}
	const result = deps.load(account);
	cache.set(key, { at: now, result });
	return result;
};
