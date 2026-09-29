import { afterEach, beforeEach, expect, test } from "bun:test";
import { FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { humanWait } from "../../../../../integrations/langflow/tests/system/humanWait";
import type { Tx } from "../../db/tx";
import { fixture as legacyRecord } from "../legacyFlowHistory/fixture";
import { langflowActionReceipts, langflowExecutions } from "../../db/tables/langflowExecution";
import { actionFixture } from "./actionFixture";
import { actionRequest } from "./actionRequest";
import { prepareAction } from "./prepareAction";

let h: Awaited<ReturnType<typeof actionFixture>>;
beforeEach(async () => {
	h = await actionFixture();
});
afterEach(async () => {
	await h.close();
});

const startPath = "/flow-executions/start-v1";
test("an exact start replay retains its legacy engine after the saved flow changes", async () => {
	const legacy = legacyRecord();
	const document = { ...legacy.doc, flow: { ...legacy.doc.flow, id: h.flow.id, project: "SYSTEM" } };
	const state = { ...legacy.state, flowId: h.flow.id };
	await h.db.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,diff_id,actor_kind,actor_name,request_id,request,head_sha,doc,state,revision,created_at,updated_at)
		VALUES (${legacy.id},${h.flow.id},${h.ticket.id},${h.ticket.project.id},${h.diff.id},'human','fixture',
		${h.input.requestId},${JSON.stringify(h.input)}::jsonb,${h.input.headSha},${JSON.stringify(document)}::jsonb,
		${JSON.stringify(state)}::jsonb,${legacy.revision},${h.ctx.now},${h.ctx.now})`);
	await h.open();
	const response = await h.request(startPath, h.input);
	expect(response.status).toBe(200);
	const view = FlowExecutionViewV1Schema.parse(await response.json());
	expect(view.engine).toBe("legacy");
	expect(view.id).toBe(legacy.id);
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(h.control.gate.read().permits[0]!.terminal?.outcome).toBe("completed");
});

test("mounted actions refuse a closed gate without a receipt or reservation", async () => {
	const response = await h.request(startPath, h.input);
	expect(response.status).toBe(409);
	expect((await response.json()).code).toBe("FLOW_RECOVERY_BLOCKED");
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(0);
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(h.control.gate.read().permits).toHaveLength(0);
});

test("mounted start commits one reservation and settles the exact durable receipt", async () => {
	await h.save();
	await h.publish();
	await h.open();
	const response = await h.request(startPath, h.input);
	expect(response.status).toBe(200);
	const view = FlowExecutionViewV1Schema.parse(await response.json());
	expect(view.engine).toBe("langflow");
	expect(view.submission?.engineEpoch).toBeNull();
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(1);
	expect(h.control.gate.read().permits[0]!.terminal?.outcome).toBe("completed");
	h.control.gate.closeDispatch({ requestId: "later-block", reason: { kind: "capture", snapshotId: "later" } });
	const replay = await h.request(startPath, h.input);
	expect(replay.status).toBe(200);
	expect((await replay.json()).id).toBe(view.id);
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(1);
	const changed = await h.request(startPath, { ...h.input, headSha: "b".repeat(40) });
	expect(changed.status).toBe(409);
	expect((await changed.json()).code).toBe("FLOW_REQUEST_CONFLICT");
});

test("a known refusal retains its HTTP response through exact replay", async () => {
	await h.save();
	await h.publish();
	await h.open();
	const stale = { ...h.input, expectedVersion: 1 };
	const response = await h.request(startPath, stale);
	expect(response.status).toBe(412);
	const body = await response.json();
	expect(body.code).toBe("FLOW_VERSION_CONFLICT");
	const [receipt] = await h.db.select().from(langflowActionReceipts);
	expect(receipt!.outcome).toBe("refused");
	expect(receipt!.executionId).toBeNull();
	expect(JSON.parse(receipt!.errorBytes!)).toMatchObject({ code: body.code, status: 412, data: body.data });
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(h.control.gate.read().permits[0]!.terminal?.outcome).toBe("refused");
	const replay = await h.request(startPath, stale);
	expect(replay.status).toBe(412);
	expect(await replay.json()).toEqual(body);
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(1);
});

test("an uncertain reservation remains pending and never repeats its mutation", async () => {
	await h.save();
	await h.publish();
	await h.open();
	const { binding } = actionRequest(h.io.actor, { operation: "start", input: h.input });
	h.control.gate.acquire(binding);
	const response = await h.request(startPath, h.input);
	expect(response.status).toBe(409);
	expect((await response.json()).code).toBe("FLOW_ACTION_PENDING");
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(h.control.gate.read().permits[0]!.terminal).toBeNull();
});

test("mounted decision and cancellation retain their separate durable results", async () => {
	const waiting = await humanWait(h);
	await h.open();
	const decision = await h.request(`/flow-executions/${waiting.input.id}/decision-v1`, waiting.input);
	expect(decision.status).toBe(200);
	const decided = FlowExecutionViewV1Schema.parse(await decision.json());
	expect(decided.decisionDeliveries).toHaveLength(1);
	const input = { id: decided.id, expectedRevision: decided.revision };
	const cancellation = await h.request(`/flow-executions/${decided.id}/cancel-v1`, input);
	expect(cancellation.status).toBe(200);
	const canceled = FlowExecutionViewV1Schema.parse(await cancellation.json());
	expect(canceled.status).toBe("canceled");
	expect(canceled.decisionDeliveries).toHaveLength(1);
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(2);
	expect(h.control.gate.read().permits.every((entry) => entry.terminal !== null)).toBe(true);
});

test("a lost transaction acknowledgement settles from the committed receipt on replay", async () => {
	await h.save();
	await h.publish();
	await h.open();
	let lose = true;
	const io = {
		...h.io,
		newTx: async <T>(fn: (tx: Tx) => Promise<T>) => {
			const result = await h.io.newTx(fn);
			if (lose) {
				lose = false;
				throw new Error("commit acknowledgement lost");
			}
			return result;
		},
	};
	await expect(prepareAction(io, { operation: "start", input: h.input })).rejects.toThrow(
		"commit acknowledgement lost",
	);
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(1);
	expect(h.control.gate.read().permits[0]!.terminal).toBeNull();
	const replay = await h.request(startPath, h.input);
	expect(replay.status).toBe(200);
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(1);
	expect(h.control.gate.read().permits[0]!.terminal?.outcome).toBe("completed");
});

test("a failed action receipt write leaves no execution and keeps its permit pending", async () => {
	await h.save();
	await h.publish();
	await h.open();
	await h.db.execute(
		sql`CREATE FUNCTION refuse_action_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt storage failed'; END $$`,
	);
	await h.db.execute(
		sql`CREATE TRIGGER refuse_action_receipt BEFORE INSERT ON langflow_action_receipts FOR EACH ROW EXECUTE FUNCTION refuse_action_receipt()`,
	);
	await expect(prepareAction(h.io, { operation: "start", input: h.input })).rejects.toThrow("receipt storage failed");
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(await h.db.select().from(langflowActionReceipts)).toHaveLength(0);
	expect(h.control.gate.read().permits[0]!.terminal).toBeNull();
});
