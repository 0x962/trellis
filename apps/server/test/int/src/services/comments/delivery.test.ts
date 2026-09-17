import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { prepareSend } from "../../../../../src/services/agentRuns/communication.ts";
import { dispatchMentions } from "../../../../../src/services/commentMentions/dispatch.ts";
import { create } from "../../../../../src/services/comments.ts";
import { recover } from "../../../../../src/services/controller/controller.ts";
import { seedProject, seedTicket } from "../../../../fixtures";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let commentId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,session_id,created_at,updated_at)
		VALUES ('537','Builder','Builder','builder','Work',${rootId},'APP',${ticket},'terminal','conversation',now(),now())`);
	await h.rebuild();
	commentId = (await h.run((ctx, tx) => create(ctx, tx, { ticket, body: "@builder fix this" }))).id;
});
const ctx = () => testCtx({ db: h.db, home: "/unused" }).ctx;
const state = async () => (await h.one(sql`SELECT state FROM comment_deliveries`)).state;
const sent = () =>
	mock(async (_ctx: Parameters<typeof prepareSend>[0], input: Parameters<typeof prepareSend>[1]) => ({ id: input.id }));

test("a mention delivers once to its captured assignment and session", async () => {
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("sent");
	expect(send.mock.calls[0]![1]).toMatchObject({
		id: "537",
		expectedTerminalId: "terminal",
		expectedSessionId: "conversation",
	});
	expect(send.mock.calls[0]![1].text).toContain(`trellis thread show ${commentId}`);
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(send).toHaveBeenCalledTimes(1);
});

test.each([false, true])("a manager mention carries only event data with reply=%s", async (reply) => {
	const worker = await h.one(sql`SELECT project_id, ticket_id FROM agent_runs WHERE id='537'`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('manager','Manager','Manager','manager','Database policy',${worker.project_id},'APP','manager-terminal','manager-conversation',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, {
			ticket: worker.ticket_id as string,
			body: "@Manager the dependency is ready",
			...(reply ? { parentId: commentId } : {}),
		}),
	);
	const send = sent();
	await dispatchMentions(
		ctx(),
		[
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
			}),
		],
		send,
	);
	expect(send).toHaveBeenCalledTimes(1);
	expect(send.mock.calls[0]![1]).toMatchObject({
		id: "manager",
		expectedTerminalId: "manager-terminal",
		expectedSessionId: "manager-conversation",
	});
	expect(JSON.parse(send.mock.calls[0]![1].text)).toEqual({
		type: "trellis.comment.mentioned",
		commentId: comment.id,
		threadId: reply ? commentId : comment.id,
		ticketId: worker.ticket_id,
		projectId: worker.project_id,
		recipient: { runId: "manager", personaName: "Manager" },
	});
});

test("a working assignment receives its mention at once", async () => {
	const send = sent();
	await dispatchMentions(
		ctx(),
		[controllerSession("terminal", { activity: { state: "working", updatedAt: new Date().toISOString() } })],
		send,
	);
	expect(await state()).toBe("sent");
	expect(send).toHaveBeenCalledTimes(1);
});

test("a failed send records an uncertain receipt", async () => {
	await dispatchMentions(ctx(), [controllerSession("terminal")], async () => {
		throw new Error("The connection closed");
	});
	expect(await state()).toBe("unknown");
});

test("a replaced session cannot receive an old mention", async () => {
	await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id='537'`);
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("replacement")], send);
	expect(await state()).toBe("failed");
	expect(send).not.toHaveBeenCalled();
});

test("a restart retains an uncertain receipt without a second send", async () => {
	await h.rows(sql`UPDATE comment_deliveries SET state='sending'`);
	await h.run((ctx, tx) => recover({ now: ctx.now }, tx, {}));
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("unknown");
	expect(send).not.toHaveBeenCalled();
});

test("a saved local pause does not prevent mention delivery", async () => {
	await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',now())`);
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("sent");
	expect(send).toHaveBeenCalledTimes(1);
});

test("a terminal without activity observations receives the mention", async () => {
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal", { activity: null })], send);
	expect(await state()).toBe("sent");
	expect(send).toHaveBeenCalledTimes(1);
});

test("a mention during startup binds the conversation of the same terminal attempt", async () => {
	await h.rows(sql`UPDATE comment_deliveries SET session_id=NULL`);
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("sent");
	expect(send.mock.calls[0]![1].expectedSessionId).toBe("conversation");
});
