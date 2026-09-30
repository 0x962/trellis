import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { type ActorRef, EpicChatterPageSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../db/epicCancellation/fixture.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { input as terminalInput } from "../agentRuns/terminal.ts";
import type { IoCtx } from "../support.ts";
import { get, list, set } from "./index.ts";
import { withChatter } from "./withChatter";

let h: Awaited<ReturnType<typeof fixture>>;
let ctx: IoCtx;
let alpha: string, beta: string, sender: string, peer: string, outside: string, session: string;
const at = new Date("2026-09-30T06:00:00Z");
const human: ActorRef = { kind: "human", name: "Planner" };
const as = (actor: ActorRef): IoCtx => ({ ...ctx, actor, core: h.ctx(actor) });
const settings = (epic: string, enabled: boolean, actor = human) =>
	h.run((tx) => set(h.ctx(actor), tx, { epic, enabled }));
const history = (epic = alpha, before?: string) => h.run((tx) => list(h.ctx(), tx, { epic, before }));

beforeAll(async () => {
	h = await fixture();
	alpha = (await h.create("Alpha")).id;
	beta = (await h.create("Beta")).id;
	const agent = async (epic: string | null, name: string) => {
		const ticket = epic ? await h.ticket(epic) : null;
		const id = ulid();
		await h.db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, ticket_id,
			harness, terminal_id, session_id, created_at, updated_at) VALUES (${id}, ${name}, ${epic ? "agent" : "session"}, '',
			${h.projectId}, 'CAN', ${ticket?.id ?? null}, '{"preset":"claude"}'::jsonb, ${id}, ${id}, ${at}, ${at})`);
		return id;
	};
	sender = await agent(alpha, "Builder");
	peer = await agent(alpha, "Reviewer");
	outside = await agent(beta, "Other epic");
	session = await agent(null, "Planning session");
	ctx = {
		actor: { kind: "agent", name: sender },
		core: h.ctx(),
		home: "",
		session: null,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => at,
		newTx: h.run,
		emit: (event) => {
			h.events.push(event);
		},
		afterCommit: () => {},
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: () => {},
	};
}, 30_000);

afterAll(async () => {
	await h.db.$client.close();
});

const runtime = (id: string) => {
	const status: RuntimeProcessStatus = {
		id,
		daemonId: "test",
		pid: null,
		mode: "pty",
		status: "running",
		startedAt: at.toISOString(),
		endedAt: null,
		exitCode: null,
		error: null,
		checkedAt: at.toISOString(),
		elapsedMs: 0,
		controllable: true,
		process: null,
		launch: { command: "claude", args: [], cwd: "" },
		agent: null,
		activity: { state: "idle", updatedAt: at.toISOString() },
		acknowledgedMessageIds: [id],
		result: null,
	};
	return {
		client: {
			inspect: mock(async () => status),
			deliver: mock(async () => {
				throw new Error("Unexpected delivery");
			}),
			queueInput: mock(async () => {
				throw new Error("Unexpected queue");
			}),
			subscribeSession: async function* () {},
		},
		host: {
			send: mock(async () => status),
			sendAtTurnBoundary: mock(async () => status),
			interrupt: mock(async () => status),
		},
		preset: async () => "claude" as const,
	};
};

test("existing epics default to enabled and real sends retain complete text", async () => {
	expect(await h.run((tx) => get(h.ctx(), tx, { epic: alpha }))).toEqual({ epicId: alpha, enabled: true });
	const deps = runtime(peer);
	const text = `${"Line α 日本語\n".repeat(5000)}<script>alert(1)</script>`;
	await prepareSend(ctx, { id: peer, text }, deps);
	expect(deps.host.send).toHaveBeenCalledTimes(1);
	EpicChatterPageSchema.parse(await history());
	expect((await history()).items[0]).toMatchObject({
		text,
		senderName: "Builder",
		recipientName: "Reviewer",
		state: "sent",
	});
});

test("off blocks both directions across epic and session boundaries before runtime access", async () => {
	await settings(alpha, false);
	for (const [from, to] of [
		[sender, peer],
		[sender, outside],
		[sender, session],
		[outside, sender],
		[session, sender],
	]) {
		const deps = runtime(to!);
		await expect(
			prepareSend(as({ kind: "agent", name: from! }), { id: to!, text: "blocked", interrupt: true }, deps),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED", data: { issues: [{ path: ["chatter"] }] } });
		expect(deps.client.inspect).not.toHaveBeenCalled();
		expect(deps.host.interrupt).not.toHaveBeenCalled();
		expect(deps.host.send).not.toHaveBeenCalled();
	}
});

test("raw terminal input also respects the epic switch", async () => {
	await expect(terminalInput(ctx, { id: peer, text: "hello" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["chatter"] }] },
	});
});

test("human messages and system notices still reach a disabled epic", async () => {
	const before = (await history()).items.length;
	for (const actor of [human, { kind: "system" as const, name: "trellis" }]) {
		const deps = runtime(sender);
		await prepareSend(as(actor), { id: sender, text: "notice" }, deps);
		expect(deps.host.send).toHaveBeenCalledTimes(1);
	}
	expect((await history()).items).toHaveLength(before);
});

test("agents cannot reenable Chatter and the setting persists across contexts", async () => {
	await expect(settings(alpha, true, ctx.actor)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(await h.run((tx) => get(h.ctx(), tx, { epic: "CAN/alpha" }))).toEqual({ epicId: alpha, enabled: false });
	await settings(alpha, true);
	const deps = runtime(outside);
	await prepareSend(ctx, { id: outside, text: "resumed", atTurnBoundary: true }, deps);
	expect(deps.host.sendAtTurnBoundary).toHaveBeenCalledTimes(1);
	expect((await history(beta)).items[0]).toMatchObject({ text: "resumed", state: "queued" });
});

test("a failed send retains unconfirmed delivery without reporting success", async () => {
	const deps = runtime(peer);
	deps.host.send.mockImplementation(async () => {
		throw new Error("lost receipt");
	});
	await expect(prepareSend(ctx, { id: peer, text: "uncertain" }, deps)).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
	});
	expect((await history()).items.find((item) => item.text === "uncertain")?.state).toBe("unconfirmed");
});

test("the log deduplicates delivery identifiers and rejects changed message bytes", async () => {
	const input = { id: peer, text: "once", messageId: "stable" };
	await prepareSend(ctx, input, runtime(peer));
	await prepareSend(ctx, input, runtime(peer));
	expect((await history()).items.filter((item) => item.text === "once")).toHaveLength(1);
	await expect(prepareSend(ctx, { ...input, text: "changed" }, runtime(peer))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("pagination retains every message and no duplicate", async () => {
	for (let i = 0; i < 57; i++) await withChatter(ctx, { id: peer, text: `message ${i}` }, async () => ({}));
	const first = await history();
	expect(first.items).toHaveLength(50);
	expect(first.nextCursor).not.toBeNull();
	const second = await history(alpha, first.nextCursor!);
	const combined = [...first.items, ...second.items];
	expect(new Set(combined.map((item) => item.id)).size).toBe(combined.length);
	expect(combined.filter((item) => item.text.startsWith("message "))).toHaveLength(57);
	expect(second.nextCursor).toBeNull();
});

test("archived projects refuse setting changes", async () => {
	await h.db.execute(sql`UPDATE projects SET archived_at=${at} WHERE id=${h.projectId}`);
	await h.run((tx) => h.cache.rebuild(tx));
	await expect(settings(alpha, false)).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
});
