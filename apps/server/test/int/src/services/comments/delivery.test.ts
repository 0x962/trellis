import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { prepareSend } from "../../../../../src/services/agentRuns/communication.ts";
import { dispatchMentions as dispatch } from "../../../../../src/services/commentMentions/dispatch.ts";
import { create } from "../../../../../src/services/comments.ts";
import { recover } from "../../../../../src/services/controller/controller.ts";
import { seedProject, seedTicket } from "../../../../fixtures";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

const dispatchMentions = (...args: Parameters<typeof dispatch>) =>
	dispatch(args[0], args[1], args[2], async () => "claude");
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
		requireIdle: true,
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

test("a busy assignment retains its pending mention", async () => {
	const send = sent();
	await dispatchMentions(
		ctx(),
		[controllerSession("terminal", { activity: { state: "working", updatedAt: new Date().toISOString() } })],
		send,
	);
	expect(await state()).toBe("pending");
	expect(send).not.toHaveBeenCalled();
});

test("an atomic busy rejection retains the pending mention", async () => {
	await dispatchMentions(ctx(), [controllerSession("terminal")], async () => {
		throw Object.assign(new Error("Busy"), { code: "RUNTIME_BUSY" });
	});
	expect(await state()).toBe("pending");
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

test("the global pause prevents automatic mention delivery", async () => {
	await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',now())`);
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("pending");
	expect(send).not.toHaveBeenCalled();
});

test("a custom terminal receives the mention without native activity observations", async () => {
	const send = sent();
	await dispatch(ctx(), [controllerSession("terminal", { activity: null })], send, async () => "custom");
	expect(await state()).toBe("sent");
	expect(send.mock.calls[0]![1].requireIdle).toBe(false);
});

test("a mention during startup binds the conversation of the same terminal attempt", async () => {
	await h.rows(sql`UPDATE comment_deliveries SET session_id=NULL`);
	const send = sent();
	await dispatchMentions(ctx(), [controllerSession("terminal")], send);
	expect(await state()).toBe("sent");
	expect(send.mock.calls[0]![1].expectedSessionId).toBe("conversation");
});

test("a pending persona mention starts an assignment from the saved delivery", async () => {
	const target = await h.one<{ project_id: string; ticket_id: string }>(
		sql`SELECT project_id,ticket_id FROM agent_runs WHERE id='537'`,
	);
	const personaId = ulid();
	await h.rows(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, { ticket: target.ticket_id, body: "@Release Builder ship this." }),
	);
	const start = mock(async (_ctx: unknown, _input: Record<string, unknown>) => {
		await h.rows(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,session_id,created_at,updated_at)
			VALUES ('started','Release Builder',${personaId},'Release Builder','builder','Ship the change.',${target.project_id},'APP',${target.ticket_id},'started-terminal','started-session',now(),now())`);
		return { id: "started" };
	});
	await dispatch(ctx(), [], sent(), async () => "claude", start);
	expect(start).toHaveBeenCalledTimes(1);
	expect(start.mock.calls[0]![1]).toMatchObject({
		personaId,
		ticket: target.ticket_id,
		note: "@Release Builder ship this.",
		requestId: `mention-${comment.id}-${personaId}`,
	});
	expect(
		await h.one<{ run_id: string | null; state: string; error: string | null }>(
			sql`SELECT run_id,state,error FROM comment_deliveries WHERE comment_id=${comment.id}`,
		),
	).toEqual({
		run_id: "started",
		state: "sent",
		error: null,
	});
});

test("a pending manager mention starts a project assignment", async () => {
	const target = await h.one<{ project_id: string; ticket_id: string }>(
		sql`SELECT project_id,ticket_id FROM agent_runs WHERE id='537'`,
	);
	const personaId = ulid();
	await h.rows(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Manager','manager','Manage releases.',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, { ticket: target.ticket_id, body: "@Release Manager coordinate this." }),
	);
	const start = mock(async (_ctx: unknown, _input: Record<string, unknown>) => {
		await h.rows(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
			VALUES ('started-manager','Release Manager',${personaId},'Release Manager','manager','Manage releases.',${target.project_id},'APP','manager-terminal','manager-session',now(),now())`);
		return { id: "started-manager" };
	});
	await dispatch(ctx(), [], sent(), async () => "claude", start);
	expect(start.mock.calls[0]![1]).toMatchObject({
		personaId,
		project: target.project_id,
		note: "@Release Manager coordinate this.",
		requestId: `mention-${comment.id}-${personaId}`,
	});
	expect(start.mock.calls[0]![1]).not.toHaveProperty("ticket");
});

test("a start that closes before dispatch saves the run error", async () => {
	const target = await h.one<{ project_id: string; ticket_id: string }>(
		sql`SELECT project_id,ticket_id FROM agent_runs WHERE id='537'`,
	);
	const personaId = ulid();
	await h.rows(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, { ticket: target.ticket_id, body: "@Release Builder ship this." }),
	);
	const start = mock(async () => {
		await h.rows(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,closed_at,error,created_at,updated_at)
			VALUES ('closed-start','Release Builder',${personaId},'Release Builder','builder','Ship the change.',${target.project_id},'APP',${target.ticket_id},'closed-terminal',now(),'The start command failed.',now(),now())`);
		return { id: "closed-start" };
	});
	await dispatch(ctx(), [], sent(), async () => "claude", start);
	expect(
		await h.one<{ run_id: string | null; state: string; error: string | null }>(
			sql`SELECT run_id,state,error FROM comment_deliveries WHERE comment_id=${comment.id}`,
		),
	).toEqual({
		run_id: "closed-start",
		state: "failed",
		error: "The start command failed.",
	});
});

test("a refused persona start saves the specific reason", async () => {
	const target = await h.one<{ project_id: string; ticket_id: string }>(
		sql`SELECT project_id,ticket_id FROM agent_runs WHERE id='537'`,
	);
	const personaId = ulid();
	await h.rows(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, { ticket: target.ticket_id, body: "@Release Builder ship this." }),
	);
	const start = mock(async () => {
		throw new ORPCError("DUPLICATE", {
			defined: true,
			status: 409,
			message: "A row with this value exists.",
			data: { field: "project concurrency limit" },
		});
	});
	await dispatch(ctx(), [], sent(), async () => "claude", start);
	expect(
		await h.one<{ run_id: string | null; state: string; error: string | null }>(
			sql`SELECT run_id,state,error FROM comment_deliveries WHERE comment_id=${comment.id}`,
		),
	).toEqual({
		run_id: null,
		state: "failed",
		error: "The project concurrency limit stopped the start.",
	});
});

test("persona deletion leaves a failed delivery instead of blocking the delete", async () => {
	const target = await h.one<{ ticket_id: string }>(sql`SELECT ticket_id FROM agent_runs WHERE id='537'`);
	const personaId = ulid();
	await h.rows(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, { ticket: target.ticket_id, body: "@Release Builder ship this." }),
	);
	await h.rows(sql`DELETE FROM personas WHERE id=${personaId}`);
	await dispatch(ctx(), [], sent(), async () => "claude");
	expect(
		await h.one<{ run_id: string | null; state: string; error: string | null }>(
			sql`SELECT run_id,state,error FROM comment_deliveries WHERE comment_id=${comment.id}`,
		),
	).toEqual({
		run_id: null,
		state: "failed",
		error: "The persona was deleted before Trellis started the assignment.",
	});
});
