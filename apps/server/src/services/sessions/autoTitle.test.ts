import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { nameSessionFromFirstExchange } from "./autoTitle.ts";
import { getSession } from "./queries.ts";
import { rename } from "./rename.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const at = "2026-09-25T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const normalRunId = ulid();
const renamedRunId = ulid();
const duplicateRunId = ulid();
const resumedRunId = ulid();
const normalSessionId = ulid();
const renamedSessionId = ulid();
const duplicateSessionId = ulid();
const resumedSessionId = ulid();

const titleContext = (): IoCtx => {
	const actor = { kind: "system" as const, name: "trellis" };
	const core = { ...ctx, actor };
	return {
		...core,
		core,
		home: "/tmp/trellis-session-title-test",
		maxUploadBytes: 1,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => new Date(at),
		ghStatus: () => ({ ok: true, user: "test", reason: null, message: null, checkedAt: at }),
		addresses: async () => [],
		log: () => undefined,
		afterCommit: () => undefined,
		newTx: run,
		vacuum: async () => undefined,
		localUrl: "http://localhost:4521",
		background: () => undefined,
	};
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, workspace_id, terminal_id, session_id, created_at, updated_at) VALUES
		(${normalRunId}, 'New session', 'session', 'Fix the login tests.', '', 'workspace-1', 'terminal-1', 'conversation-1', ${at}, ${at}),
		(${renamedRunId}, 'New session', 'session', 'Explain the cache.', '', 'workspace-2', 'terminal-2', 'conversation-2', ${at}, ${at}),
		(${duplicateRunId}, 'New session', 'session', 'Add a session title.', '', 'workspace-3', 'terminal-3', 'conversation-3', ${at}, ${at}),
		(${resumedRunId}, 'New session', 'session', 'Review the session list.', '', 'workspace-4', 'terminal-4', 'conversation-4', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions
		(id, name, title_state, directory, harness, run_id, created_at, updated_at) VALUES
		(${normalSessionId}, 'New session', 'temporary', '/tmp/normal-session', '{"preset":"claude"}'::jsonb, ${normalRunId}, ${at}, ${at}),
		(${renamedSessionId}, 'New session', 'temporary', '/tmp/renamed-session', '{"preset":"claude"}'::jsonb, ${renamedRunId}, ${at}, ${at}),
		(${duplicateSessionId}, 'New session', 'temporary', '/tmp/duplicate-session', '{"preset":"claude"}'::jsonb, ${duplicateRunId}, ${at}, ${at}),
		(${resumedSessionId}, 'New session', 'temporary', '/tmp/resumed-session', '{"preset":"claude"}'::jsonb, ${resumedRunId}, ${at}, ${at})`);
	const cache = createCache();
	ctx = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4521",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("the first complete exchange supplies one session title", async () => {
	const before = (
		await db.execute(sql`SELECT
		s.id,s.directory,s.run_id,r.project_id,r.ticket_id,r.workspace_id,r.terminal_id,r.session_id,r.instruction
		FROM sessions s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=${normalSessionId}`)
	).rows[0];
	const named = await nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: normalSessionId, agentResponse: "The login tests now pass." },
		async (_titleCtx, input) => {
			expect(input.userMessage).toBe("Fix the login tests.");
			expect(input.agentResponse).toBe("The login tests now pass.");
			return "Fix login tests";
		},
	);
	const after = (
		await db.execute(sql`SELECT
		s.id,s.directory,s.run_id,r.project_id,r.ticket_id,r.workspace_id,r.terminal_id,r.session_id,r.instruction
		FROM sessions s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=${normalSessionId}`)
	).rows[0];
	expect(named?.name).toBe("Fix login tests");
	expect((await db.execute(sql`SELECT title_state FROM sessions WHERE id=${normalSessionId}`)).rows[0]).toEqual({
		title_state: "set",
	});
	expect((await run((tx) => getRun(tx, normalRunId))).name).toBe("Fix login tests");
	expect(after).toEqual(before);
});

test("a user rename before completion keeps the user title", async () => {
	await run((tx) => rename(ctx, tx, { id: renamedSessionId, name: "New session" }));
	let requests = 0;
	const named = await nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: renamedSessionId, agentResponse: "The cache stores project rows." },
		async () => {
			requests++;
			return "Explain the cache";
		},
	);
	expect(named).toBeNull();
	expect(requests).toBe(0);
	expect((await run((tx) => getSession(tx, renamedSessionId))).name).toBe("New session");
});

test("duplicate completion events make one title request", async () => {
	let requests = 0;
	let answer!: (title: string) => void;
	const title = new Promise<string>((resolve) => {
		answer = resolve;
	});
	const requestTitle = async () => {
		requests++;
		return title;
	};
	const first = nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: duplicateSessionId, agentResponse: "The title service is ready." },
		requestTitle,
	);
	const duplicate = nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: duplicateSessionId, agentResponse: "The title service is ready." },
		requestTitle,
	);
	while (requests === 0) await Bun.sleep(0);
	answer("Add session titles");
	await Promise.all([first, duplicate]);
	expect(requests).toBe(1);
	expect((await run((tx) => getSession(tx, duplicateSessionId))).name).toBe("Add session titles");
});

test("a later completion after resume keeps the saved title", async () => {
	let requests = 0;
	const requestTitle = async () => {
		requests++;
		return "Review session list";
	};
	await nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: resumedSessionId, agentResponse: "The review is complete." },
		requestTitle,
	);
	await nameSessionFromFirstExchange(
		titleContext(),
		{ sessionId: resumedSessionId, agentResponse: "The resumed work is complete." },
		requestTitle,
	);
	expect(requests).toBe(1);
	expect((await run((tx) => getSession(tx, resumedSessionId))).name).toBe("Review session list");
});
