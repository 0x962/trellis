import type { HarnessAccountQuota } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { readCredential } from "./credentials.ts";
import { fetchAccountQuota } from "./fetchQuota.ts";
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
	if (saved && now - saved.at < (input.refresh ? 10000 : 300000)) return saved.result;
	const result = deps.load(account);
	cache.set(key, { at: now, result });
	return result;
};
