import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { readDecision, readProjection } from "../../../db/queries/langflowExecution";
import { langflowDecisions, langflowOutbox } from "../../../db/tables/langflowExecution";
import { openTestDbFromArchive } from "../../../db/testDb.ts";
import { getView } from "../../langflowProjection";
import { deliver } from "../deliver";
import { deliverDecision } from "../deliverDecision";
import { prepareDelivery } from "../prepareDelivery";
import { recordAcknowledgement } from "../recordAcknowledgement";
import { accepted } from "../testFixture";
import { transactionFixture } from "./components/transactionFixture";
import { record } from "./record.ts";

let db: Awaited<ReturnType<typeof transactionFixture>>["db"];
afterEach(async () => {
	await db.$client.close();
});

test("concurrent humans commit one receipt and one outbox item", async () => {
	const f = await transactionFixture();
	db = f.db;
	const input = { ...f.input, output: "Full notes\n".repeat(100_001) };
	const results = await Promise.allSettled([
		db.transaction((tx) => record(f.ctx, tx, input)),
		db.transaction((tx) => record({ ...f.ctx, actor: { kind: "human", name: "second" } }, tx, input)),
	]);
	expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
	expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
	const decisions = await db.select().from(langflowDecisions);
	const outbox = await db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"));
	expect(decisions).toHaveLength(1);
	expect(outbox).toHaveLength(1);
	expect(decisions[0]!.delivery.decision.output).toBe(input.output);
	expect(outbox[0]!.payloadBytes).toBe(decisions[0]!.payloadBytes);
	const projected = await db.transaction((tx) => readProjection(tx, { executionId: input.id }));
	expect(projected!.view.revision).toBe(input.expectedRevision + 1);
	expect(projected!.view.failureKind).toBeNull();
	expect(projected!.view.decisionDeliveries[0]!.approved).toBe(false);
});

test("a transaction failure removes both the receipt and outbox", async () => {
	const f = await transactionFixture();
	db = f.db;
	await expect(
		db.transaction(async (tx) => {
			await record(f.ctx, tx, f.input);
			throw new Error("crash before commit");
		}),
	).rejects.toThrow("crash before commit");
	expect(await db.select().from(langflowDecisions)).toHaveLength(0);
	expect(await db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"))).toHaveLength(0);
	expect((await db.transaction((tx) => readProjection(tx, { executionId: f.input.id })))!.view.revision).toBe(
		f.input.expectedRevision,
	);
});

test("a failed acknowledgement commit recovers from the permanent engine acceptance", async () => {
	const f = await transactionFixture();
	db = f.db;
	const view = await db.transaction((tx) => record(f.ctx, tx, f.input));
	const decisionId = view.decisionDeliveries[0]!.decisionId;
	const key = { executionId: f.input.id, decisionId };
	const first = (await db.transaction((tx) => prepareDelivery(f.system, tx, { ...key, authority: f.authority })))!;
	let receipt: ReturnType<typeof accepted> | undefined;
	let lookup: Parameters<typeof accepted>[0];
	let calls = 0;
	const engine = {
		lookup: async (input: Parameters<typeof accepted>[0]) => {
			lookup = input;
			return receipt ? { state: "accepted", receipt } : { state: "absent", authoritative: true, lookup: input };
		},
		accept: async () => {
			calls++;
			receipt = accepted(lookup);
			return receipt;
		},
	};
	const delivery = await deliver(first, engine, () => {});
	await expect(
		db.transaction(async (tx) => {
			await recordAcknowledgement(f.system, tx, { ...key, delivery });
			throw new Error("crash before acknowledgement commit");
		}),
	).rejects.toThrow("crash before acknowledgement commit");
	expect((await db.transaction((tx) => readDecision(tx, key)))!.delivery.state).toBe("pending");
	const next = (await db.transaction((tx) => prepareDelivery(f.system, tx, { ...key, authority: f.authority })))!;
	const recovered = await deliver(next, engine, () => {});
	await db.transaction((tx) => recordAcknowledgement(f.system, tx, { ...key, delivery: recovered }));
	expect(calls).toBe(1);
	expect((await db.transaction((tx) => readDecision(tx, key)))!.delivery.state).toBe("confirmed");
	const [outbox] = await db.select().from(langflowOutbox).where(eq(langflowOutbox.id, decisionId));
	expect(outbox!.receipt).toEqual(receipt!);
	const unknown = { ...first.delivery, state: "unknown" as const, acceptance: null };
	const late = await db.transaction((tx) => recordAcknowledgement(f.system, tx, { ...key, delivery: unknown }));
	expect(late.decisionDeliveries[0]!.state).toBe("confirmed");
});

test("native actors cannot record a human decision or an acknowledgement", async () => {
	const f = await transactionFixture();
	db = f.db;
	const actor = { ...f.ctx, actor: { kind: "agent" as const, name: "native" } };
	await expect(db.transaction((tx) => record(actor, tx, f.input))).rejects.toThrow("A person must answer");
	await expect(
		db.transaction((tx) =>
			prepareDelivery(actor, tx, { executionId: f.input.id, decisionId: "missing", authority: f.authority }),
		),
	).rejects.toThrow("authority_conflict");
	expect(await db.select().from(langflowDecisions)).toHaveLength(0);
});

test("restored delivery reconciles a lost response through the same receipt and public revision", async () => {
	const f = await transactionFixture();
	db = f.db;
	const recorded = await db.transaction((tx) => record(f.ctx, tx, f.input));
	const decisionId = recorded.decisionDeliveries[0]!.decisionId;
	const input = { executionId: f.input.id, decisionId, authority: f.authority };
	let receipt: ReturnType<typeof accepted> | undefined;
	let lookup: Parameters<typeof accepted>[0];
	let acceptCalls = 0;
	const engine = {
		lookup: async (request: Parameters<typeof accepted>[0]) => {
			lookup = request;
			return receipt ? { state: "accepted", receipt } : { state: "absent", authoritative: true, lookup: request };
		},
		accept: async () => {
			acceptCalls++;
			receipt = accepted(lookup);
			throw new TypeError("lost response after engine commit");
		},
	};
	const context = () => ({ core: f.system, newTx: db.transaction.bind(db), log: () => {} });
	const unknown = (await deliverDecision(context(), input, engine))!;
	expect(unknown.revision).toBe(recorded.revision + 2);
	expect(unknown.decisionDeliveries[0]).toMatchObject({
		decisionId,
		actionKey: f.input.key,
		state: "unknown",
		output: f.input.output,
	});
	const saved = await db.transaction((tx) => readDecision(tx, input));
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);
	const restored = await db.transaction((tx) => getView(f.ctx, tx, { id: f.input.id }));
	expect(restored).toEqual(unknown);
	await expect(db.transaction((tx) => record(f.ctx, tx, f.input))).rejects.toMatchObject({
		code: "FLOW_VERSION_CONFLICT",
		data: { version: unknown.revision },
	});
	const confirmed = (await deliverDecision(context(), input, engine))!;
	expect(confirmed.revision).toBe(unknown.revision + 2);
	expect(confirmed.decisionDeliveries[0]).toMatchObject({
		decisionId,
		actionKey: f.input.key,
		state: "confirmed",
		acceptedReceiptId: receipt!.acceptanceId,
	});
	expect(acceptCalls).toBe(1);
	expect(await db.select().from(langflowDecisions)).toHaveLength(1);
	const outbox = await db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"));
	expect(outbox).toHaveLength(1);
	expect(outbox[0]!.payloadBytes).toBe(saved!.payloadBytes);
	expect(outbox[0]!.receipt).toEqual(receipt!);
	expect(await deliverDecision(context(), input, engine)).toBeNull();
});
