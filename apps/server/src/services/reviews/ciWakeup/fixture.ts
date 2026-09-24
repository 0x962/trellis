import { expect, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { createCache } from "../../../db/cache.ts";
import { rows } from "../../../db/queries/support.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { CheckNoticeKind } from "../../../gh/checkNotice.ts";
import { prepareSend } from "../../agentRuns/communication.ts";
import type { startNative } from "../../agentRuns/nativeStart.ts";
import { resumeIdleSession } from "../../agentRuns/resumeIdleSession";
import type { IoCtx } from "../../support.ts";
import { create } from "../../tickets/create.ts";
import { dispatchDeliveries } from "../dispatchDeliveries.ts";
import { enqueueCheckDeliveries } from "../enqueueCheckDeliveries.ts";

export async function fixture() {
	const db = await openTestDb();
	const home = await mkdtemp(join(tmpdir(), "trellis-ci-wakeup-"));
	const at = new Date();
	const projectId = ulid(),
		id = ulid(),
		terminalId = crypto.randomUUID(),
		sessionId = crypto.randomUUID();
	const workspace = join(home, "work");
	await mkdir(join(home, "harness-attempts", terminalId), { recursive: true });
	await writeFile(join(home, "harness-attempts", terminalId, "launch.json"), JSON.stringify({ harness: "claude" }));
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,directory,created_at,updated_at)
		VALUES (${projectId},'CIW','ciw','CI wakeup',${workspace},${at},${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx: IoCtx = {
		home,
		actor: { kind: "human", name: "qa" },
		session: null,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
		core: {
			actor: { kind: "human", name: "qa" },
			now: at,
			cache,
			actorCache: new Map(),
			session: null,
			reqId: ulid(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost",
		},
	};
	const ticket = await ctx.newTx((tx) => create(ctx.core, tx, { project: "CIW", title: "Fix CI" }));
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_key,project_id,ticket_id,ticket_identifier,harness,
		terminal_id,session_id,workspace_id,created_at,updated_at)
		VALUES (${id},'ci-test','agent','Original task',${workspace},${projectId},${ticket.id},${ticket.identifier},
		${JSON.stringify({ preset: "claude" })}::jsonb,${terminalId},${sessionId},${workspace},${at},${at})`);
	const saved: RuntimeProcessStatus = {
		id: terminalId,
		daemonId: "test",
		pid: null,
		mode: "pty",
		status: "exited",
		stopReason: "idle",
		startedAt: at.toISOString(),
		endedAt: at.toISOString(),
		exitCode: 0,
		error: null,
		checkedAt: at.toISOString(),
		elapsedMs: 0,
		controllable: false,
		process: null,
		launch: { command: "claude", args: [], cwd: workspace },
		agent: {
			sessionId,
			model: null,
			turnId: null,
			tool: null,
			lastTool: null,
			lastMessage: null,
			error: null,
			outcome: "completed",
		},
		activity: { state: "idle", updatedAt: at.toISOString() },
		acknowledgedMessageIds: [terminalId],
		result: null,
	};
	let current = saved;
	const prompts: string[] = [];
	const messages: { terminalId: string; text: string; messageId: string }[] = [];
	const status = spyOn(HarnessHost.prototype, "status").mockImplementation(async () => saved);
	const waitFor = spyOn(HarnessHost.prototype, "waitFor").mockImplementation(async (_id, matches) => {
		expect(matches(saved)).toBe(true);
		return saved;
	});
	const start: typeof startNative = async (_ctx, input) => {
		prompts.push(input.resumePrompt!);
		expect(input.resume).toBe(true);
		expect(input.previousAttemptId).toBe(terminalId);
		expect(input.run.sessionId).toBe(sessionId);
		expect(input.run.workspaceId).toBe(workspace);
		current = {
			...saved,
			id: input.attempt.id,
			status: "running",
			stopReason: undefined,
			endedAt: null,
			controllable: true,
			acknowledgedMessageIds: [input.attempt.id],
		};
		return { id, launchedAt: at.toISOString() };
	};
	const deps = {
		client: {
			inspect: async () => current,
			deliver: async () => {
				throw new Error("Unexpected terminal delivery");
			},
			subscribeSession: async function* () {},
		},
		host: {
			send: async (terminalId: string, text: string, messageId: string) => {
				messages.push({ terminalId, text, messageId });
				return current;
			},
			interrupt: async () => current,
		},
		preset: async () => "claude" as const,
		resume: (context: Parameters<typeof resumeIdleSession>[0], input: Parameters<typeof resumeIdleSession>[1]) =>
			resumeIdleSession(context, input, start),
	};
	const dispatch: typeof dispatchDeliveries = (context, sessions) =>
		dispatchDeliveries(
			context,
			sessions,
			(context, input) => prepareSend(context, input, deps),
			async () => "claude",
		);
	let number = 0;
	const queue = async (kind: CheckNoticeKind = "failed") => {
		const prId = ulid();
		const url = `https://github.com/o/r/pull/${++number}`;
		await db.execute(sql`INSERT INTO pull_requests (id,owner,repo,number,url,state,head_sha,created_at,updated_at)
			VALUES (${prId},'o','r',${number},${url},'open','head',${at},${at})`);
		await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
			VALUES (${ticket.id},${prId},'manual','qa','human',${at})`);
		await ctx.newTx((tx) =>
			enqueueCheckDeliveries(tx, {
				prId,
				headSha: "head",
				kind,
				checks: [{ name: "test", workflow: "CI", link: null, lines: [] }],
				at,
			}),
		);
		const [delivery] = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`SELECT delivery.id FROM review_deliveries delivery
			JOIN check_notices notice ON notice.id=delivery.check_notice_id WHERE notice.pr_id=${prId}`,
			),
		);
		return { prId, url, deliveryId: delivery!.id };
	};
	return {
		ctx,
		db,
		id,
		terminalId,
		sessionId,
		workspace,
		saved,
		dispatch,
		queue,
		prompts,
		messages,
		current: () => current,
		delivery: async (id: string) =>
			(
				await ctx.newTx((tx) =>
					rows<{ state: string; error: string | null }>(
						tx,
						sql`SELECT state,error FROM review_deliveries WHERE id=${id}`,
					),
				)
			)[0]!,
		// The directory goes before the database closes, because a failed
		// close would otherwise leave it in the temporary directory.
		close: async () => {
			status.mockRestore();
			waitFor.mockRestore();
			await rm(home, { recursive: true, force: true });
			await db.$client.close();
		},
	};
}
