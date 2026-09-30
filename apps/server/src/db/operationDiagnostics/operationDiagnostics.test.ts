import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openDb } from "../client.ts";
import { createMeasuredTransaction } from "../createMeasuredTransaction";
import { createMaintenance } from "../maintenance.ts";
import { createOperationDiagnostics, type OperationEvent } from "./operationDiagnostics";

test("clears transaction wait when the database rejects before acquisition", async () => {
	const events: OperationEvent[] = [];
	const failure = new Error("database unavailable");
	const diagnostics = createOperationDiagnostics((event) => events.push(event));
	const transaction = createMeasuredTransaction(
		{
			transaction: async () => {
				throw failure;
			},
		},
		{
			name: "tickets.get",
			reqId: "reader",
			diagnostics,
			log: () => undefined,
			longTransactionMs: Infinity,
		},
	);
	await expect(transaction(async () => 1)).rejects.toBe(failure);
	expect(events).toEqual([
		{
			type: "begin",
			operation: expect.objectContaining({ phase: "transaction.wait", name: "tickets.get", reqId: "reader", id: 1 }),
		},
		{ type: "end", id: 1, at: expect.any(Number), outcome: "failure" },
	]);
});

test("distinguishes a waiting transaction and clears acquired transactions after commit or rollback", async () => {
	const db = await openDb(":memory:");
	const events: OperationEvent[] = [];
	const diagnostics = createOperationDiagnostics((event) => events.push(event));
	const enter = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const failure = new Error("private failure content");
	const transaction = (reqId: string) =>
		createMeasuredTransaction(db, {
			name: "tickets.create",
			reqId,
			diagnostics,
			log: () => undefined,
			longTransactionMs: Infinity,
		});
	try {
		const first = transaction("first")(async (tx) => {
			await tx.execute(sql`SELECT 1`);
			enter.resolve();
			await release.promise;
			return 7;
		});
		await enter.promise;
		const second = transaction("second")(async () => {
			throw failure;
		});
		expect(
			events.filter((event) => event.type === "begin").map((event) => [event.operation.reqId, event.operation.phase]),
		).toEqual([
			["first", "transaction.wait"],
			["first", "transaction"],
			["second", "transaction.wait"],
		]);
		release.resolve();
		expect(await first).toBe(7);
		await expect(second).rejects.toBe(failure);
		const starts = events.filter((event) => event.type === "begin");
		const ends = events.filter((event) => event.type === "end");
		expect(ends.map((event) => event.id).sort()).toEqual(starts.map((event) => event.operation.id).sort());
		expect(ends.at(-1)?.outcome).toBe("failure");
		expect(JSON.stringify(events)).not.toContain("private failure content");
	} finally {
		release.resolve();
		await db.$client.close();
	}
});

test("raw maintenance identifies each submitted table and clears failed work without logging SQL", async () => {
	const events: OperationEvent[] = [];
	const diagnostics = createOperationDiagnostics((event) => events.push(event));
	const failure = new Error("private SQL content");
	let calls = 0;
	const maintenance = createMaintenance(
		{
			execute: async () => {
				calls += 1;
				if (calls === 2) throw failure;
			},
		},
		diagnostics,
		"backup-request",
	);
	await expect(maintenance.runNow()).rejects.toBe(failure);
	expect(events.filter((event) => event.type === "begin").map((event) => event.operation)).toEqual([
		expect.objectContaining({ phase: "maintenance.submitted", name: "vacuum.tickets", reqId: "backup-request" }),
		expect.objectContaining({ phase: "maintenance.submitted", name: "vacuum.activity", reqId: "backup-request" }),
	]);
	expect(events.filter((event) => event.type === "end").map((event) => event.outcome)).toEqual(["success", "failure"]);
	expect(JSON.stringify(events)).not.toMatch(/SQL|VACUUM|private/);
});
