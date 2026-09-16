import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { prepareSend } from "../../../../../src/services/agentRuns/communication.ts";
import { seedDefaultChannels } from "../../../../../src/services/chat/channels.ts";
import { dispatchChat as dispatch } from "../../../../../src/services/chat/dispatch.ts";
import { post } from "../../../../../src/services/chat/messages.ts";
import { recover } from "../../../../../src/services/controller/controller.ts";
import { seedProject } from "../../../../fixtures";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

const dispatchChat = (...args: Parameters<typeof dispatch>) =>
	dispatch(args[0], args[1], args[2], async () => "claude");
let h: Harness;
let rootId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	rootId = (await seedProject(h.db)).rootId;
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('builder','Builder','Builder','builder','Build',${rootId},'CDE','terminal','conversation',now(),now()),
		('manager','Trellis','Trellis','manager','Coordinate',${rootId},'CDE','manager-terminal','manager-conversation',now(),now())`);
	await h.rebuild();
	await h.run((ctx, tx) => seedDefaultChannels(ctx, tx, rootId));
});
const ctx = () => testCtx({ db: h.db, home: "/unused" }).ctx;
const say = (body: string, actor: { kind: "human" | "agent"; name: string } = { kind: "human", name: "dana" }) =>
	h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "ai", body }), { actor });
const states = async () =>
	(
		await h.rows<{ run_id: string; state: string }>(sql`SELECT run_id, state FROM chat_deliveries ORDER BY run_id, id`)
	).map((row) => `${row.run_id}:${row.state}`);
const sent = () =>
	mock(async (_ctx: Parameters<typeof prepareSend>[0], input: Parameters<typeof prepareSend>[1]) => ({ id: input.id }));
const managerSession = () =>
	controllerSession("manager-terminal", {
		agent: {
			sessionId: "manager-conversation",
			model: null,
			turnId: null,
			tool: null,
			lastTool: null,
			lastMessage: null,
			error: null,
			outcome: null,
		},
	});

test("one agent receives all of its pending lines in one send", async () => {
	await say("first");
	await say("second");
	const send = sent();
	await dispatchChat(ctx(), [controllerSession("terminal")], send);
	expect(send).toHaveBeenCalledTimes(1);
	expect(send.mock.calls[0]![1]).toMatchObject({
		id: "builder",
		expectedTerminalId: "terminal",
		expectedSessionId: "conversation",
		interrupt: false,
	});
	const text = send.mock.calls[0]![1].text;
	expect(text).toContain("2 new messages in the CDE room");
	expect(text).toContain("#ai 12:00:00 <dana> first");
	expect(text).toContain("#ai 12:00:00 <dana> second");
	expect(text).toContain("trellis chat post CDE <channel> --body");
	expect(await states()).toEqual(["builder:sent", "builder:sent", "manager:pending", "manager:pending"]);
	await dispatchChat(ctx(), [controllerSession("terminal")], send);
	expect(send).toHaveBeenCalledTimes(1);
});

test("an agent line names the persona and the run id, so a reader can mention it", async () => {
	await say("done with TRL-1", { kind: "agent", name: "builder" });
	const send = sent();
	await dispatchChat(ctx(), [managerSession()], send);
	expect(JSON.parse(send.mock.calls[0]![1].text)).toEqual({
		type: "trellis.chat.messages",
		project: "CDE",
		messages: [
			{
				id: expect.any(String),
				channel: "ai",
				body: "done with TRL-1",
				createdAt: "2026-09-09T12:00:00.000Z",
				actor: { kind: "agent", name: "builder", displayName: "Builder" },
				mention: false,
			},
		],
		mentioned: false,
		recipient: { runId: "manager", personaName: "Trellis" },
	});
	expect(await states()).toEqual(["manager:sent"]);
});

test("a mention interrupts the mentioned agent, and only that agent", async () => {
	await say("@manager where are we?");
	await say("fyi all");
	const send = sent();
	await dispatchChat(ctx(), [controllerSession("terminal"), managerSession()], send);
	const byRun = Object.fromEntries(send.mock.calls.map((call) => [call[1].id, call[1]]));
	expect(byRun.manager!.interrupt).toBe(true);
	expect(JSON.parse(byRun.manager!.text)).toMatchObject({
		mentioned: true,
		messages: [
			{ body: "@manager where are we?", mention: true },
			{ body: "fyi all", mention: false },
		],
	});
	expect(byRun.builder!.interrupt).toBe(false);
	expect(byRun.builder!.text).not.toContain("mentions you");
	await say("@Builder rebase now");
	const again = sent();
	await dispatchChat(ctx(), [controllerSession("terminal")], again);
	expect(again.mock.calls[0]![1].interrupt).toBe(true);
	expect(again.mock.calls[0]![1].text).toContain("One mentions you. Answer it now.");
});

test("a working agent receives its lines at once, and a failed send leaves them unknown", async () => {
	await say("now");
	const send = sent();
	await dispatchChat(
		ctx(),
		[controllerSession("terminal", { activity: { state: "working", updatedAt: new Date().toISOString() } })],
		send,
	);
	expect(send).toHaveBeenCalledTimes(1);
	expect(await states()).toContain("builder:sent");
	await say("again");
	await dispatchChat(ctx(), [controllerSession("terminal")], async () => {
		throw new Error("The connection closed");
	});
	expect(await states()).toContain("builder:unknown");
});

test("a replaced session fails its lines and a restart marks an interrupted send unknown", async () => {
	await say("stale");
	await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id='builder'`);
	const send = sent();
	await dispatchChat(ctx(), [controllerSession("replacement")], send);
	expect(await states()).toContain("builder:failed");
	expect(send.mock.calls.map((call) => call[1].id)).not.toContain("builder");
	await h.rows(sql`UPDATE chat_deliveries SET state='sending' WHERE run_id='manager'`);
	await h.run((ctx, tx) => recover({ now: ctx.now }, tx, {}));
	expect(await states()).toContain("manager:unknown");
});

test("the global pause holds every line", async () => {
	await say("later");
	await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',now())`);
	const send = sent();
	await dispatchChat(ctx(), [controllerSession("terminal"), managerSession()], send);
	expect(send).not.toHaveBeenCalled();
	expect(await states()).toEqual(["builder:pending", "manager:pending"]);
});

test("a terminal without activity observations receives the lines", async () => {
	await say("no observations");
	const send = sent();
	await dispatchChat(ctx(), [controllerSession("terminal", { activity: null })], send);
	expect(send.mock.calls.map((call) => call[1].id)).toContain("builder");
});

test("a custom terminal receives a mention as typed input, without an interrupt", async () => {
	await say("@Builder look");
	const send = sent();
	await dispatch(ctx(), [controllerSession("terminal", { activity: null })], send, async () => "custom");
	expect(send.mock.calls[0]![1]).toMatchObject({ id: "builder", interrupt: false });
});
