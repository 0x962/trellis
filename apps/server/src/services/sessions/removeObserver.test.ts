import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { ObserverHarnessError } from "../sessionObserverHarness/index.ts";
import { at, context, seed } from "../sessionObservers/testFixture.ts";
import type { IoCtx } from "../support.ts";
import { getSession } from "./queries.ts";
import { prepareDelete } from "./remove.ts";

test("session deletion reports an unconfirmed observer stop and preserves the session", async () => {
	const { db, standaloneSessionId } = await seed();
	try {
		const ctx = {
			core: context([]),
			home: "/unused-observer-delete",
			now: () => at,
			newTx: (fn) => db.transaction(fn),
		} as IoCtx;
		const message = "The runtime could not confirm that the observer stopped.";
		const deletion = prepareDelete(ctx, { id: standaloneSessionId }, undefined, async () => {
			throw new ObserverHarnessError("OBSERVER_CANCEL_UNCONFIRMED", message);
		});
		await expect(deletion).rejects.toBeInstanceOf(ORPCError);
		await expect(deletion).rejects.toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			status: 503,
			message,
			data: { reason: "error" },
		});
		expect(await db.transaction((tx) => getSession(tx, standaloneSessionId))).toBeDefined();
	} finally {
		await db.$client.close();
	}
});
