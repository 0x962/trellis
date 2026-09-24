import { expect } from "bun:test";
import type { ProviderCreateInput } from "@trellis/api";
import { ulid } from "ulid";
import type { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";
import { create } from "../providers.ts";
import type { ProviderFetch } from "../remote.ts";

export const remoteHarness = (db: Awaited<ReturnType<typeof openTestDb>>) => {
	const logs: unknown[] = [];
	const commits: Array<() => Promise<void>> = [];
	let insideTx = false;
	let now = Date.parse("2026-09-24T20:00:00.000Z");
	const ctx = {
		home: ulid(),
		actor: { kind: "human", name: "Navid" },
		now: () => new Date(now),
		emit: () => {},
		log: (...args: unknown[]) => logs.push(args),
		afterCommit: (task: () => Promise<void>) => commits.push(task),
		newTx: async <T>(fn: (tx: Tx) => Promise<T>) => {
			insideTx = true;
			const result = await db.transaction(fn);
			insideTx = false;
			return result;
		},
	} as unknown as IoCtx;
	return {
		ctx,
		logs,
		now: () => now,
		advance: (ms: number) => {
			now += ms;
		},
		create: (input: Partial<ProviderCreateInput> = {}) =>
			db.transaction((tx) =>
				create(ctx, tx, {
					name: ulid(),
					kind: "vercel-ai-gateway",
					apiKey: "secret-provider-1234",
					...input,
				}),
			),
		commit: async () => {
			for (const task of commits.splice(0)) await task();
		},
		fetch:
			(read: ProviderFetch): ProviderFetch =>
			(url, init) => {
				expect(insideTx).toBe(false);
				expect(init.method).toBe("GET");
				expect(init.redirect).toBe("manual");
				expect(init.signal).toBeInstanceOf(AbortSignal);
				return read(url, init);
			},
	};
};
