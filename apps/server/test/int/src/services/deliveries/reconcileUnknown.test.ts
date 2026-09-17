import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { chatBatchMessageId } from "../../../../../src/services/chat/batchMessageId.ts";
import { seedDefaultChannels } from "../../../../../src/services/chat/channels.ts";
import { dispatchMessageId } from "../../../../../src/services/controller/messageId.ts";
import { reconcileUnknownDeliveries } from "../../../../../src/services/deliveries/reconcileUnknown.ts";
import { lostDelivery, unconfirmedDelivery } from "../../../../../src/services/deliveries/sentences.ts";
import { seedProject } from "../../../../fixtures";
import { seedComment, seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

const TERMINAL = "terminal";
const DISPATCH = "dispatch";

let h: Harness;
let rootId: string;
let chatIds: string[];
let commentDeliveryId: string;

beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	const seeded = await seedProject(h.db);
	rootId = seeded.rootId;
	await h.rebuild();
	await h.run((ctx, tx) => seedDefaultChannels(ctx, tx, rootId));
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('builder','Builder','Builder','builder','Build',${rootId},'CDE',${TERMINAL},'conversation',now(),now())`);
	chatIds = [ulid(), ulid()];
	for (const id of chatIds) {
		const messageId = ulid();
		await h.rows(
			sql`INSERT INTO chat_messages (id,project_id,channel,body,actor_name,actor_kind,created_at) VALUES (${messageId},${rootId},'general','hello','dana','human',now())`,
		);
		await h.rows(
			sql`INSERT INTO chat_deliveries (id,message_id,run_id,persona_name,terminal_id,session_id,state,error)
			VALUES (${id},${messageId},'builder','Builder',${TERMINAL},'conversation','unknown',${unconfirmedDelivery})`,
		);
	}
	commentDeliveryId = ulid();
	await h.run(async (_ctx, tx) => {
		const ticketId = await seedTicket(tx, { projectId: rootId, rootId, statusId: seeded.statuses.todo });
		const commentId = await seedComment(tx, ticketId, "look at this");
		await tx.execute(
			sql`INSERT INTO comment_deliveries (id,comment_id,run_id,persona_name,terminal_id,session_id,state,error)
			VALUES (${commentDeliveryId},${commentId},'builder','Builder',${TERMINAL},'conversation','unknown',${unconfirmedDelivery})`,
		);
	});
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,run_id,terminal_id,session_id,generation,state,events,due_at,error,created_at,updated_at)
		VALUES (${DISPATCH},${rootId},'builder',${TERMINAL},'conversation',0,'unknown','[]'::jsonb,now(),${unconfirmedDelivery},now(),now())`);
});

const ctx = () => testCtx({ db: h.db, home: "/unused" }).ctx;
const states = async (table: string) =>
	(
		await h.rows<{ state: string; error: string | null }>(sql`SELECT state, error FROM ${sql.raw(table)} ORDER BY id`)
	).map((row) => `${row.state}:${row.error ?? ""}`);
const run = (
	sessions: ReturnType<typeof controllerSession>[],
	ask: (id: string, messageId: string) => Promise<boolean>,
) => reconcileUnknownDeliveries(ctx(), { sessions }, ask);
const live = () => [controllerSession(TERMINAL, { acknowledgedMessageIds: [] })];
const ended = () => [controllerSession(TERMINAL, { acknowledgedMessageIds: [], status: "exited" as const })];

test("a ledger record turns every uncertain row of one send into a sent row", async () => {
	const delivered = [
		chatBatchMessageId(chatIds),
		commentDeliveryId,
		dispatchMessageId({ id: DISPATCH, generation: 0 }),
	];
	await run(live(), async (_id, messageId) => delivered.includes(messageId));
	expect(await states("chat_deliveries")).toEqual(["sent:", "sent:"]);
	expect(await states("comment_deliveries")).toEqual(["sent:"]);
	expect(await states("manager_dispatches")).toEqual(["sent:"]);
});

test("an agent receipt confirms a send without a ledger question", async () => {
	let asked = 0;
	const sessions = [
		controllerSession(TERMINAL, { acknowledgedMessageIds: [commentDeliveryId, chatBatchMessageId(chatIds)] }),
	];
	await run(sessions, async () => {
		asked++;
		return false;
	});
	expect(await states("chat_deliveries")).toEqual(["sent:", "sent:"]);
	expect(await states("comment_deliveries")).toEqual(["sent:"]);
	expect(asked).toBe(1);
});

test("an ended session without a ledger record fails the row with one sentence", async () => {
	await run(ended(), async () => false);
	expect(await states("chat_deliveries")).toEqual([`failed:${lostDelivery}`, `failed:${lostDelivery}`]);
	expect(await states("comment_deliveries")).toEqual([`failed:${lostDelivery}`]);
	expect(await states("manager_dispatches")).toEqual([`failed:${lostDelivery}`]);
});

test("a running session without a ledger record leaves the row uncertain", async () => {
	await run(live(), async () => false);
	expect(await states("chat_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`, `unknown:${unconfirmedDelivery}`]);
	expect(await states("comment_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`]);
	expect(await states("manager_dispatches")).toEqual([`unknown:${unconfirmedDelivery}`]);
});

test("a runtime that cannot answer leaves the row uncertain", async () => {
	await run(ended(), () => Promise.reject(new Error("Session terminal does not exist")));
	expect(await states("chat_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`, `unknown:${unconfirmedDelivery}`]);
	expect(await states("comment_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`]);
	expect(await states("manager_dispatches")).toEqual([`unknown:${unconfirmedDelivery}`]);
});

test("a session the runtime has no record of leaves every row uncertain", async () => {
	await run([], async () => true);
	expect(await states("chat_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`, `unknown:${unconfirmedDelivery}`]);
	expect(await states("comment_deliveries")).toEqual([`unknown:${unconfirmedDelivery}`]);
	expect(await states("manager_dispatches")).toEqual([`unknown:${unconfirmedDelivery}`]);
});

test("a chat group that lost a row keeps the remaining rows uncertain", async () => {
	const batchId = chatBatchMessageId(chatIds);
	await h.rows(sql`UPDATE chat_deliveries SET state='sent', error=NULL WHERE id=${chatIds[0]}`);
	await run(live(), async (_id, messageId) => messageId === batchId);
	expect(await states("chat_deliveries")).toContain(`unknown:${unconfirmedDelivery}`);
});
