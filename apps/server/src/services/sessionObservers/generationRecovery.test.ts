import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDbFromArchive } from "../../db/testDb.ts";
import { getSessionUpdates } from "../sessionUpdates/queries.ts";
import {
	claimSessionObserverGeneration,
	failSessionObserverGeneration,
	get as getObserver,
	linkSessionObserverRun,
	recoverSessionObserverGenerations,
	retrySessionObserverGeneration,
	saveSessionObserverGeneration,
	saveSessionObserverSummary,
	setEnabled,
} from "./index.ts";
import { at, context, seed } from "./testFixture.ts";

test("links one hidden run only while the exact observer claim remains active", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }));
		const claim = await value.db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
		);
		const linked = await value.db.transaction(async (tx) => {
			await tx.execute(sql`INSERT INTO agent_runs
				(id, name, runtime, harness, kind, instruction, project_key, created_at, updated_at)
				VALUES (${claim!.observerId}, 'Session observer', 'native',
				'{"preset":"claude","model":"anthropic/claude-sonnet-5.5","effort":"medium"}'::jsonb,
				'session', 'Observe the session.', '', ${at}, ${at})`);
			return linkSessionObserverRun(tx, {
				runId: value.ticketRunId,
				claimId: claim!.claimId,
				observerRunId: claim!.observerId,
			});
		});
		expect(linked).toMatchObject({ observerRunId: claim!.observerId, claimId: claim!.claimId });
		const metadata = await value.db.transaction((tx) => getObserver(ctx, tx, { sessionId: value.ticketRunId }));
		expect(metadata).toMatchObject({
			observerRunId: claim!.observerId,
			harnessPreset: "claude",
			modelId: "anthropic/claude-sonnet-5.5",
		});
		expect(
			await value.db.transaction((tx) =>
				linkSessionObserverRun(tx, {
					runId: value.ticketRunId,
					claimId: crypto.randomUUID(),
					observerRunId: claim!.observerId,
				}),
			),
		).toBeNull();
	} finally {
		await value.db.$client.close();
	}
});

test("recovers an abandoned claim once and rejects its late result", async () => {
	const value = await seed();
	const ctx = context([]);
	await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.standaloneRunId, enabled: true }));
	const abandoned = await value.db.transaction((tx) =>
		claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-1" }),
	);
	await value.db.transaction(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs
			(id, name, runtime, harness, kind, instruction, project_key, created_at, updated_at)
			VALUES (${abandoned!.observerId}, 'Session observer', 'native',
			'{"preset":"claude","model":"anthropic/claude-sonnet-5.5","effort":"medium"}'::jsonb,
			'session', 'Observe the session.', '', ${at}, ${at})`);
		await linkSessionObserverRun(tx, {
			runId: value.standaloneRunId,
			claimId: abandoned!.claimId,
			observerRunId: abandoned!.observerId,
		});
	});
	const archive = await value.db.$client.dumpDataDir("none");
	await value.db.$client.close();
	const restarted = await openTestDbFromArchive(archive);
	try {
		expect(
			await restarted.transaction((tx) =>
				recoverSessionObserverGenerations(context([], new Date(at.getTime() + 1)), tx),
			),
		).toEqual([{ runId: value.standaloneRunId, observerRunId: abandoned!.observerId }]);
		const replacement = await restarted.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-1" }),
		);
		expect(replacement).toMatchObject({ generation: 2, throughCursor: "cursor-1" });
		expect(
			await restarted.transaction((tx) =>
				saveSessionObserverGeneration(ctx, tx, {
					runId: value.standaloneRunId,
					claimId: abandoned!.claimId,
					throughCursor: "cursor-1",
					messages: [{ role: "assistant", body: "Stale result." }],
					update: { body: "Stale result." },
				}),
			),
		).toBeNull();
		expect(
			await restarted.transaction((tx) =>
				saveSessionObserverGeneration(ctx, tx, {
					runId: value.standaloneRunId,
					claimId: replacement!.claimId,
					throughCursor: "cursor-1",
					messages: [{ role: "assistant", body: "Recovered result." }],
					update: { body: "Recovered result." },
				}),
			),
		).toMatchObject({ observer: { lastConsumedCursor: "cursor-1" } });
	} finally {
		await restarted.$client.close();
	}
});

test("keeps failed activity pending without repeating the same request", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }));
		const first = await value.db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
		);
		const failure = {
			code: "CLAUDE_MODEL_UNAVAILABLE" as const,
			message: "Configure Claude Sonnet 5.5 for the observer.",
		};
		await value.db.transaction((tx) =>
			failSessionObserverGeneration(ctx, tx, {
				runId: value.ticketRunId,
				claimId: first!.claimId,
				error: failure,
			}),
		);
		expect(
			await value.db.transaction((tx) =>
				claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
			),
		).toBeNull();
		const observer = await value.db.transaction((tx) => getObserver(ctx, tx, { sessionId: value.ticketRunId }));
		expect(observer).toMatchObject({ lastConsumedCursor: null, lastAttemptedCursor: "cursor-1", error: failure });
		expect(await value.db.transaction((tx) => getSessionUpdates(tx, { runId: value.ticketRunId }))).toMatchObject({
			latest: null,
		});
		await value.db.transaction((tx) => retrySessionObserverGeneration(ctx, tx, { runId: value.ticketRunId }));
		expect(
			await value.db.transaction((tx) =>
				claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
			),
		).not.toBeNull();
	} finally {
		await value.db.$client.close();
	}
});

test("saves one durable summary without completing its generation", async () => {
	const value = await seed();
	try {
		const ctx = context([]);
		await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: value.ticketRunId, enabled: true }));
		const claim = await value.db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: value.ticketRunId, throughCursor: "cursor-1" }),
		);
		const first = await value.db.transaction((tx) =>
			saveSessionObserverSummary(ctx, tx, {
				runId: value.ticketRunId,
				claimId: claim!.claimId,
				message: { role: "assistant", body: "Earlier context." },
			}),
		);
		const replay = await value.db.transaction((tx) =>
			saveSessionObserverSummary(ctx, tx, {
				runId: value.ticketRunId,
				claimId: claim!.claimId,
				message: { role: "assistant", body: "Duplicate delivery." },
			}),
		);
		expect(replay).toEqual(first);
		expect(first).toMatchObject({ generation: claim!.generation, position: 0, body: "Earlier context." });
		expect(await value.db.transaction((tx) => getObserver(ctx, tx, { sessionId: value.ticketRunId }))).toMatchObject({
			generationState: "generating",
			lastConsumedCursor: null,
			lastAttemptedCursor: null,
		});
		expect(await value.db.transaction((tx) => getSessionUpdates(tx, { runId: value.ticketRunId }))).toMatchObject({
			latest: null,
		});
	} finally {
		await value.db.$client.close();
	}
});
