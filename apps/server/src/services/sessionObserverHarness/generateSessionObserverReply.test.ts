import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { pauseRestartFixture } from "../agentRuns/pauseRestartFixture";
import {
	claimSessionObserverGeneration,
	linkSessionObserverRun,
	recoverSessionObserverGenerations,
	setEnabled,
} from "../sessionObservers/index.ts";
import { at, context, seed } from "../sessionObservers/testFixture";
import type { IoCtx } from "../support.ts";
import { ensureSessionObserverRun } from "./ensureSessionObserverRun.ts";
import { generateSessionObserverReply } from "./generateSessionObserverReply.ts";
import { SESSION_OBSERVER_MODEL } from "./types.ts";

test("returns a complete reply, replays it after restart, and stops the exact canceled attempt", async () => {
	const { db, ticketRunId } = await seed();
	const home = await mkdtemp(join(tmpdir(), "trellis-observer-generation-"));
	try {
		const core = context([]);
		const ctx = { core, home, now: () => at, newTx: (fn) => db.transaction(fn) } as IoCtx;
		const accountId = ulid();
		await db.execute(sql`INSERT INTO harness_accounts (id,name,harness,profile_path,created_at,updated_at)
			VALUES (${accountId},'Fixture','claude','/unused-profile',${at},${at})`);
		await db.transaction((tx) => setEnabled(core, tx, { sessionId: ticketRunId, enabled: true }));
		const claim = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "activity" }),
		))!;
		const identity = {
			observerId: claim.observerId,
			sourceRunId: ticketRunId,
			modelId: SESSION_OBSERVER_MODEL,
			accountId,
		};
		const hidden = await ensureSessionObserverRun(ctx, identity);
		await db.transaction((tx) => linkSessionObserverRun(tx, { runId: ticketRunId, claimId: claim.claimId, ...hidden }));
		const controller = new AbortController();
		const input = {
			...identity,
			...hidden,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			instruction: "Narrate only.",
			userContext: "Exact context",
			signal: controller.signal,
		};
		const states = new Map<string, RuntimeProcessStatus>();
		let starts = 0;
		let cancel = false;
		const stopped: string[] = [];
		const client = {
			recover: async (id: string) => states.get(id)!,
			stop: async (id: string) => {
				stopped.push(id);
				const state = { ...states.get(id)!, status: "exited" as const };
				states.set(id, state);
				return state;
			},
			subscribeSession: async function* (id: string, signal: AbortSignal) {
				if (cancel) {
					controller.abort();
					signal.throwIfAborted();
				}
				yield { type: "session" as const, session: states.get(id)! };
			},
		} as unknown as RuntimeClient;
		const deps: Parameters<typeof generateSessionObserverReply>[2] = {
			runtime: async () => client,
			start: async (_ctx, launch, hooks) => {
				starts++;
				expect(launch.run.ticketId).toBeNull();
				expect(launch.textOnly?.system).toBe(input.instruction);
				expect(launch.resumePrompt).toBe(input.userContext);
				expect(launch.config.harness.model).toBe(SESSION_OBSERVER_MODEL);
				expect(await launch.authorizeLaunch!()).toBe(true);
				expect(hooks?.guide).toBeDefined();
				states.set(launch.attempt.id, {
					...pauseRestartFixture(launch.attempt.id, at),
					status: "running",
					activity: { state: "idle", updatedAt: at.toISOString() },
					agent: {
						sessionId: launch.textOnly!.sessionId,
						model: SESSION_OBSERVER_MODEL,
						outcome: "completed",
						turnId: "turn",
						tool: null,
						lastTool: null,
						lastMessage: null,
						error: null,
					},
					acknowledgedMessageIds: [launch.attempt.id],
					result: { id: "result", text: "Complete narrative" },
				});
				return { id: launch.run.id };
			},
			usage: async () => ({
				source: "claude-transcript",
				requests: [
					{
						messageId: "message",
						requestId: "request",
						uncachedInput: 10,
						cachedInput: 2,
						cacheWrite5m: 0,
						cacheWrite1h: 0,
						output: 4,
						reasoningOutput: 0,
					},
				],
			}),
		};
		const result = await generateSessionObserverReply(ctx, input, deps);
		expect(result.text).toBe("Complete narrative");
		expect(stopped).toEqual([result.attemptId]);
		await db.transaction((tx) => recoverSessionObserverGenerations(core, tx));
		const replacement = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "activity" }),
		))!;
		expect(await generateSessionObserverReply(ctx, { ...input, claimId: replacement.claimId }, deps)).toEqual(result);
		expect(starts).toBe(1);
		cancel = true;
		input.userContext = "Summary context";
		await expect(
			generateSessionObserverReply(ctx, { ...input, claimId: replacement.claimId, deliveryId: "summary" }, deps),
		).rejects.toMatchObject({ code: "OBSERVER_REQUEST_CANCELED" });
		expect(starts).toBe(2);
		expect(stopped.at(-1)).not.toBe(result.attemptId);
	} finally {
		await db.$client.close();
		await rm(home, { recursive: true, force: true });
	}
}, 30000);
