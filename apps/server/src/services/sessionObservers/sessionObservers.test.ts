import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { get as getSessionUpdates } from "../sessionUpdates";
import {
	claimSessionObserverGeneration,
	get as getObserver,
	history as getObserverHistory,
	listSessionObserverCandidates,
	saveSessionObserverGeneration,
	setEnabled,
} from "./index.ts";
import { context, seed } from "./testFixture";

test("keeps observers off until a person enables a ticket or standalone session", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		const ticket = await value.db.transaction((tx) => getObserver(ctx, tx, { sessionId: value.ticketRunId }));
		const standalone = await value.db.transaction((tx) =>
			getObserver(ctx, tx, { sessionId: value.standaloneSessionId }),
		);
		expect(ticket).toMatchObject({ runId: value.ticketRunId, enabled: false, observerId: null });
		expect(standalone).toMatchObject({ runId: value.standaloneRunId, enabled: false, observerRunId: null });
		expect((await value.db.execute(sql`SELECT count(*)::int AS count FROM session_observers`)).rows).toEqual([
			{ count: 0 },
		]);
	} finally {
		await value.db.$client.close();
	}
});

test("enables one durable Claude observer and reuses it after disablement", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		const first = await value.db.transaction((tx) =>
			setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true, activityThreshold: 12 }),
		);
		const duplicate = await value.db.transaction((tx) =>
			setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }),
		);
		expect(first).toMatchObject({ cancelGeneration: false, requestInitialGeneration: true });
		expect(duplicate).toMatchObject({ cancelGeneration: false, requestInitialGeneration: false });
		expect(duplicate.observer).toMatchObject({
			observerId: first.observer.observerId,
			observerRunId: null,
			harnessPreset: null,
			accountId: null,
			modelId: null,
			providerSessionId: null,
			activityThreshold: 12,
		});

		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: false }));
		const enabledAgain = await value.db.transaction((tx) =>
			setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }),
		);
		expect(enabledAgain).toMatchObject({ requestInitialGeneration: true });
		expect(enabledAgain.observer.observerId).toBe(first.observer.observerId);
		expect((await value.db.execute(sql`SELECT count(*)::int AS count FROM agent_runs`)).rows).toEqual([{ count: 2 }]);
	} finally {
		await value.db.$client.close();
	}
});

test("lists enabled candidates with the approved activity threshold", async () => {
	const value = await seed();
	try {
		await value.db.transaction((tx) => setEnabled(context([]), tx, { sessionId: value.ticketRunId, enabled: true }));
		expect(await value.db.transaction((tx) => listSessionObserverCandidates(tx))).toEqual([
			{
				runId: value.ticketRunId,
				observerRunId: null,
				lastConsumedCursor: null,
				lastAttemptedCursor: null,
				hasObserverMessages: false,
				activityThreshold: 20,
			},
		]);
	} finally {
		await value.db.$client.close();
	}
});

test("claims once and reads the complete conversation only through history", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.standaloneRunId, enabled: true }));
		const [first, second] = await Promise.all([
			value.db.transaction((tx) =>
				claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-1" }),
			),
			value.db.transaction((tx) =>
				claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-1" }),
			),
		]);
		const claim = first ?? second;
		expect([first, second].filter((entry) => entry !== null)).toHaveLength(1);
		const saved = await value.db.transaction((tx) =>
			saveSessionObserverGeneration(ctx, tx, {
				runId: value.standaloneRunId,
				claimId: claim!.claimId,
				throughCursor: "cursor-1",
				messages: [
					{ role: "user", body: "Summarize the completed work." },
					{ role: "assistant", body: "The worker completed the storage contract." },
				],
				update: { body: "The worker completed the storage contract." },
			}),
		);
		expect(saved?.observer).toMatchObject({ lastConsumedCursor: "cursor-1", generationState: "idle" });
		expect("messages" in saved!.observer).toBe(false);
		const history = await value.db.transaction((tx) =>
			getObserverHistory(ctx, tx, { sessionId: value.standaloneRunId }),
		);
		expect(history.messages.map(({ role, body }) => ({ role, body }))).toEqual([
			{ role: "user", body: "Summarize the completed work." },
			{ role: "assistant", body: "The worker completed the storage contract." },
		]);
		const next = await value.db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-2" }),
		);
		expect(next).toMatchObject({ fromCursor: "cursor-1", throughCursor: "cursor-2", generation: 2 });
	} finally {
		await value.db.$client.close();
	}
});

test("prevents a disabled generation from publishing a late result", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }));
		const claim = await value.db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
		);
		const disabled = await value.db.transaction((tx) =>
			setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: false }),
		);
		expect(disabled).toMatchObject({ cancelGeneration: true, observer: { generationState: "idle" } });
		expect(
			await value.db.transaction((tx) =>
				saveSessionObserverGeneration(ctx, tx, {
					runId: value.ticketRunId,
					claimId: claim!.claimId,
					throughCursor: "cursor-1",
					messages: [{ role: "assistant", body: "Late result." }],
					update: { body: "Late result." },
				}),
			),
		).toBeNull();
		expect(
			await value.db.transaction((tx) => getSessionUpdates(ctx, tx, { sessionId: value.ticketRunId })),
		).toMatchObject({
			latest: null,
		});
	} finally {
		await value.db.$client.close();
	}
});

test("refuses observer enablement from an agent with the declared permission error", async () => {
	const value = await seed();
	try {
		const ctx = { ...context([]), actor: { kind: "agent" as const, name: value.ticketRunId } };
		expect(
			value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true })),
		).rejects.toMatchObject({ code: "SESSION_OBSERVER_FORBIDDEN", status: 403 });
	} finally {
		await value.db.$client.close();
	}
});
