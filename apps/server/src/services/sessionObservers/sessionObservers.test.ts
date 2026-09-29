import { expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getSessionUpdates } from "../sessionUpdates/queries.ts";
import {
	claimSessionObserverGeneration,
	failSessionObserverGeneration,
	get as getObserver,
	listSessionObserverCandidates,
	saveSessionObserverGeneration,
	setEnabled,
} from "./index.ts";

const at = new Date("2026-09-29T16:00:00.000Z");

const context = (events: TrellisEvent[], now = at): ServiceCtx => ({
	actor: { kind: "human", name: "Navid" },
	session: null,
	reqId: ulid(),
	now,
	emit: (event) => events.push(event),
	cache: createCache(),
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://127.0.0.1:4521",
});

const seed = async () => {
	const db = await openTestDb();
	const projectId = ulid();
	const statusId = ulid();
	const ticketId = ulid();
	const ticketRunId = ulid();
	const standaloneRunId = ulid();
	const standaloneSessionId = ulid();
	const providerId = ulid();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'OBS', 'observers', 'Observers', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${projectId}, 1, 'Observed ticket', ${statusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, created_at, updated_at)
		VALUES
		(${ticketRunId}, 'Ticket worker', 'agent', 'Work.', ${projectId}, 'OBS', ${ticketId}, 'OBS-1', ${at}, ${at}),
		(${standaloneRunId}, 'Standalone worker', 'session', 'Work.', NULL, '', NULL, NULL, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${standaloneSessionId}, 'Observer session', '/tmp/observer-session', '{"preset":"codex"}'::jsonb,
		${standaloneRunId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO providers (id, name, kind, base_url, api_key, enabled, created_at, updated_at)
		VALUES (${providerId}, 'Observer gateway', 'vercel-ai-gateway', 'https://ai-gateway.vercel.sh', 'secret', true,
		${at}, ${at})`);
	await db.execute(sql`INSERT INTO provider_models (provider_id, model_id)
		VALUES (${providerId}, 'anthropic/claude-sonnet-5.5')`);
	return { db, providerId, standaloneRunId, standaloneSessionId, ticketRunId };
};

test("keeps observers off until a person enables a ticket or standalone session", async () => {
	const value = await seed();
	try {
		const events: TrellisEvent[] = [];
		const ctx = context(events);
		const ticket = await value.db.transaction((tx) => getObserver(ctx, tx, { sessionId: value.ticketRunId }));
		const standalone = await value.db.transaction((tx) =>
			getObserver(ctx, tx, { sessionId: value.standaloneSessionId }),
		);
		expect(ticket).toMatchObject({ runId: value.ticketRunId, enabled: false, observerId: null, messages: [] });
		expect(standalone).toMatchObject({ runId: value.standaloneRunId, enabled: false, observerId: null });
		expect((await value.db.execute(sql`SELECT count(*)::int AS count FROM session_observers`)).rows).toEqual([
			{ count: 0 },
		]);
	} finally {
		await value.db.$client.close();
	}
});

test("enables one durable observer and reuses it after disablement", async () => {
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
			providerId: value.providerId,
			modelId: "anthropic/claude-sonnet-5.5",
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

test("retains the selected gateway when its model list lacks Sonnet", async () => {
	const value = await seed();
	try {
		await value.db.execute(sql`DELETE FROM provider_models WHERE provider_id=${value.providerId}`);
		const result = await value.db.transaction((tx) =>
			setEnabled(context([]), tx, { sessionId: value.ticketRunId, enabled: true }),
		);
		expect(result).toMatchObject({
			requestInitialGeneration: true,
			observer: {
				enabled: true,
				providerId: value.providerId,
				modelId: "anthropic/claude-sonnet-5.5",
				error: null,
			},
		});
		expect(await value.db.transaction((tx) => listSessionObserverCandidates(tx))).toEqual([
			{
				runId: value.ticketRunId,
				lastConsumedCursor: null,
				hasInitialUpdate: false,
				activityThreshold: 20,
			},
		]);
	} finally {
		await value.db.$client.close();
	}
});

test("allows one generation claim and leaves later work pending", async () => {
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
		expect(claim).not.toBeNull();
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
		expect(saved?.observer.messages.map(({ role, body }) => ({ role, body }))).toEqual([
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
		expect(await value.db.transaction((tx) => getSessionUpdates(tx, { runId: value.ticketRunId }))).toMatchObject({
			latest: null,
		});
	} finally {
		await value.db.$client.close();
	}
});

test("retains messages, the cursor, the prior update, and a readable error after restart", async () => {
	const value = await seed();
	const ctx = context([]);
	await value.db.transaction((tx) => setEnabled(ctx, tx, { sessionId: "Observer session", enabled: true }));
	const first = await value.db.transaction((tx) =>
		claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-1" }),
	);
	await value.db.transaction((tx) =>
		saveSessionObserverGeneration(ctx, tx, {
			runId: value.standaloneRunId,
			claimId: first!.claimId,
			throughCursor: "cursor-1",
			messages: [{ role: "assistant", body: "Saved context." }],
			update: { body: "Saved update." },
		}),
	);
	const second = await value.db.transaction((tx) =>
		claimSessionObserverGeneration(tx, { runId: value.standaloneRunId, throughCursor: "cursor-2" }),
	);
	await value.db.transaction((tx) =>
		failSessionObserverGeneration(context([], new Date(at.getTime() + 1)), tx, {
			runId: value.standaloneRunId,
			claimId: second!.claimId,
			error: "The provider did not return a reply.",
		}),
	);
	const archive = await value.db.$client.dumpDataDir("none");
	await value.db.$client.close();
	const restarted = await openTestDbFromArchive(archive);
	try {
		const observer = await restarted.transaction((tx) =>
			getObserver(ctx, tx, { sessionId: value.standaloneSessionId }),
		);
		expect(observer).toMatchObject({
			enabled: true,
			generationState: "idle",
			lastConsumedCursor: "cursor-1",
			error: "The provider did not return a reply.",
		});
		expect(observer.messages.map(({ body }) => body)).toEqual(["Saved context."]);
		expect(await restarted.transaction((tx) => getSessionUpdates(tx, { runId: value.standaloneRunId }))).toMatchObject({
			latest: { body: "Saved update." },
		});
		const candidates = await restarted.transaction((tx: Tx) => listSessionObserverCandidates(tx));
		expect(candidates).toEqual([
			{
				runId: value.standaloneRunId,
				lastConsumedCursor: "cursor-1",
				hasInitialUpdate: true,
				activityThreshold: 20,
			},
		]);
	} finally {
		await restarted.$client.close();
	}
});
