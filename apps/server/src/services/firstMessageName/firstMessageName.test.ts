import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/queries.ts";
import { getSession } from "../sessions/queries.ts";
import { rename } from "../sessions/rename.ts";
import type { IoCtx } from "../support.ts";
import { prepareNameFromFirstMessage, saveNameFromFirstMessage } from "./index";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const at = "2026-09-25T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const normalRunId = ulid();
const renamedRunId = ulid();
const duplicateRunId = ulid();
const resumedRunId = ulid();
const racingRunId = ulid();
const normalSessionId = ulid();
const renamedSessionId = ulid();
const duplicateSessionId = ulid();
const resumedSessionId = ulid();
const racingSessionId = ulid();

const nameContext = (): IoCtx => {
	const actor = { kind: "system" as const, name: "trellis" };
	const core = { ...ctx, actor };
	return {
		...core,
		core,
		home: "/tmp/trellis-session-name-test",
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

const nameFromFirstMessage = async (
	nameCtx: IoCtx,
	input: { sessionId: string },
	requestName: NonNullable<Parameters<typeof prepareNameFromFirstMessage>[2]>,
) => {
	const prepared = await prepareNameFromFirstMessage(nameCtx, input, requestName);
	return run((tx) => saveNameFromFirstMessage(nameCtx, tx, prepared));
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, workspace_id, terminal_id, session_id, created_at, updated_at) VALUES
		(${normalRunId}, 'New session', 'session', 'Fix the login tests.', '', 'workspace-1', 'terminal-1', 'conversation-1', ${at}, ${at}),
		(${renamedRunId}, 'New session', 'session', 'Explain the cache.', '', 'workspace-2', 'terminal-2', 'conversation-2', ${at}, ${at}),
		(${duplicateRunId}, 'New session', 'session', 'Add a session name.', '', 'workspace-3', 'terminal-3', 'conversation-3', ${at}, ${at}),
		(${resumedRunId}, 'New session', 'session', 'Review the session list.', '', 'workspace-4', 'terminal-4', 'conversation-4', ${at}, ${at}),
		(${racingRunId}, 'New session', 'session', 'Explain the cache.', '', 'workspace-5', 'terminal-5', 'conversation-5', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions
		(id, name, name_state, directory, harness, run_id, created_at, updated_at) VALUES
		(${normalSessionId}, 'New session', 'temporary', '/tmp/normal-session', '{"preset":"claude"}'::jsonb, ${normalRunId}, ${at}, ${at}),
		(${renamedSessionId}, 'New session', 'temporary', '/tmp/renamed-session', '{"preset":"claude"}'::jsonb, ${renamedRunId}, ${at}, ${at}),
		(${duplicateSessionId}, 'New session', 'temporary', '/tmp/duplicate-session', '{"preset":"claude"}'::jsonb, ${duplicateRunId}, ${at}, ${at}),
		(${resumedSessionId}, 'New session', 'temporary', '/tmp/resumed-session', '{"preset":"claude"}'::jsonb, ${resumedRunId}, ${at}, ${at}),
		(${racingSessionId}, 'New session', 'temporary', '/tmp/racing-session', '{"preset":"claude"}'::jsonb, ${racingRunId}, ${at}, ${at})`);
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

test("the first prompt supplies one session name", async () => {
	const before = (
		await db.execute(sql`SELECT
		s.id,s.directory,s.run_id,r.project_id,r.ticket_id,r.workspace_id,r.terminal_id,r.session_id,r.instruction
		FROM sessions s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=${normalSessionId}`)
	).rows[0];
	const named = await nameFromFirstMessage(nameContext(), { sessionId: normalSessionId }, async (_nameCtx, input) => {
		expect(input.runId).toBe(normalRunId);
		return { candidateName: "Fix login tests", initialPrompt: "Fix the login tests.", protectedTerms: [] };
	});
	const after = (
		await db.execute(sql`SELECT
		s.id,s.directory,s.run_id,r.project_id,r.ticket_id,r.workspace_id,r.terminal_id,r.session_id,r.instruction
		FROM sessions s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=${normalSessionId}`)
	).rows[0];
	expect(named?.name).toBe("Fix login tests");
	expect((await db.execute(sql`SELECT name_state FROM sessions WHERE id=${normalSessionId}`)).rows[0]).toEqual({
		name_state: "set",
	});
	expect((await run((tx) => getRun(tx, normalRunId))).name).toBe("Fix login tests");
	expect(after).toEqual(before);
});

test("a user rename before the name request keeps the user name", async () => {
	await run((tx) => rename(ctx, tx, { id: renamedSessionId, name: "New session" }));
	let requests = 0;
	const named = await nameFromFirstMessage(nameContext(), { sessionId: renamedSessionId }, async () => {
		requests++;
		return { candidateName: "Explain the cache", initialPrompt: "Explain the cache.", protectedTerms: [] };
	});
	expect(named).toBeNull();
	expect(requests).toBe(0);
	expect((await run((tx) => getSession(tx, renamedSessionId))).name).toBe("New session");
});

test("duplicate prompt confirmations make one name request", async () => {
	let requests = 0;
	let answer!: (name: { candidateName: string; initialPrompt: string; protectedTerms: string[] }) => void;
	const name = new Promise<{ candidateName: string; initialPrompt: string; protectedTerms: string[] }>((resolve) => {
		answer = resolve;
	});
	const requestName = async () => {
		requests++;
		return name;
	};
	const first = nameFromFirstMessage(nameContext(), { sessionId: duplicateSessionId }, requestName);
	const duplicate = nameFromFirstMessage(nameContext(), { sessionId: duplicateSessionId }, requestName);
	while (requests === 0) await Bun.sleep(0);
	answer({ candidateName: "Add session names", initialPrompt: "Add a session name.", protectedTerms: [] });
	await Promise.all([first, duplicate]);
	expect(requests).toBe(1);
	expect((await run((tx) => getSession(tx, duplicateSessionId))).name).toBe("Add session names");
});

test("a later prompt after resume keeps the saved name", async () => {
	let requests = 0;
	const requestName = async () => {
		requests++;
		return { candidateName: "Review session list", initialPrompt: "Review the session list.", protectedTerms: [] };
	};
	await nameFromFirstMessage(nameContext(), { sessionId: resumedSessionId }, requestName);
	await nameFromFirstMessage(nameContext(), { sessionId: resumedSessionId }, requestName);
	expect(requests).toBe(1);
	expect((await run((tx) => getSession(tx, resumedSessionId))).name).toBe("Review session list");
});

test("a user rename during the name request keeps the user name", async () => {
	const named = await nameFromFirstMessage(nameContext(), { sessionId: racingSessionId }, async () => {
		await run((tx) => rename(ctx, tx, { id: racingSessionId, name: "Cache behavior" }));
		return { candidateName: "Explain the cache", initialPrompt: "Explain the cache.", protectedTerms: [] };
	});
	expect(named).toBeNull();
	expect((await run((tx) => getSession(tx, racingSessionId))).name).toBe("Cache behavior");
	expect((await run((tx) => getRun(tx, racingRunId))).name).toBe("Cache behavior");
});
