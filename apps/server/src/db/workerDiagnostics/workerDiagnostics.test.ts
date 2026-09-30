import { expect, test } from "bun:test";
import { createOperationDiagnostics } from "../operationDiagnostics";
import { type CallDiagnostic, createWorkerDiagnostics } from "./workerDiagnostics";

test("separates dispatch, queue, and execution while retaining the active database identity", () => {
	let now = 0;
	const pending = new Map<number, { diagnostic: CallDiagnostic }>([
		[1, { diagnostic: { name: "system.health", reqId: "health", enqueuedAt: 0, dispatchedAt: 0 } }],
	]);
	const records: Record<string, unknown>[] = [];
	const diagnostics = createWorkerDiagnostics(
		pending,
		(record) => records.push(record),
		() => now,
	);
	const operations = createOperationDiagnostics(diagnostics.receive, () => now);
	const finish = operations.begin({ phase: "transaction", name: "tickets.create", reqId: "writer" });
	now = 2000;
	diagnostics.snapshot();
	expect(records[0]).toMatchObject({
		requests: [{ reqId: "health", dispatchMs: 2000, queueMs: null, executionMs: null }],
		operations: [{ reqId: "writer", phase: "transaction", elapsedMs: 2000 }],
	});
	diagnostics.receive({ type: "receipt", id: 1, at: 2500 });
	diagnostics.receive({ type: "execution", id: 1, at: 3000 });
	now = 7000;
	diagnostics.snapshot();
	expect(records[1]).toMatchObject({ requests: [{ dispatchMs: 2500, queueMs: 500, executionMs: 4000 }] });
	finish("failure");
	now = 12000;
	diagnostics.snapshot();
	expect(records[2]).toMatchObject({ activeOperations: 0, operations: [] });
	expect(pending.size).toBe(1);
});

test("bounds snapshots without losing pending ownership or database operations beyond the detail limit", () => {
	let now = 0;
	const pending = new Map<number, { diagnostic: CallDiagnostic }>();
	const records: Record<string, unknown>[] = [];
	const diagnostics = createWorkerDiagnostics(
		pending,
		(record) => records.push(record),
		() => now,
	);
	const operations = createOperationDiagnostics(diagnostics.receive, () => now);
	const finish = [];
	for (let id = 0; id < 200; id += 1) {
		pending.set(id, { diagnostic: { name: "tickets.get", reqId: `request-${id}`, enqueuedAt: 0, dispatchedAt: 0 } });
		finish.push(operations.begin({ phase: "service", name: "tickets.get", reqId: `request-${id}` }));
	}
	finish.push(operations.begin({ phase: "transaction", name: "tickets.create", reqId: "writer" }));
	finish.push(operations.begin({ phase: "maintenance.submitted", name: "vacuum.tickets", reqId: "maintenance.timer" }));
	now = 2000;
	diagnostics.snapshot();
	expect(records[0]).toMatchObject({
		pendingRequests: 200,
		omittedRequests: 192,
		activeOperations: 202,
		omittedOperations: 186,
	});
	expect(records[0]!.requests).toHaveLength(8);
	expect(records[0]!.operations).toHaveLength(16);
	expect((records[0]!.operations as Array<{ phase: string }>).slice(0, 2).map((operation) => operation.phase)).toEqual([
		"transaction",
		"maintenance.submitted",
	]);
	for (const complete of finish) complete("success");
	now = 3000;
	diagnostics.snapshot();
	expect(records).toHaveLength(1);
	now = 7000;
	diagnostics.snapshot();
	expect(records[1]).toMatchObject({ activeOperations: 0, operations: [] });
	expect(pending.size).toBe(200);
	operations.begin({ phase: "transaction", name: "tickets.create", reqId: "interrupted" });
	diagnostics.clear();
	diagnostics.snapshot();
	expect(records[2]).toMatchObject({ activeOperations: 0, completedOperations: [] });
});

test("retains a slow operation outcome when completion precedes the host snapshot", () => {
	let now = 0;
	const pending = new Map([
		[1, { diagnostic: { name: "system.health", reqId: "reader", enqueuedAt: 0, dispatchedAt: 0 } }],
	]);
	const records: Record<string, unknown>[] = [];
	const diagnostics = createWorkerDiagnostics(
		pending,
		(record) => records.push(record),
		() => now,
	);
	const finish = createOperationDiagnostics(diagnostics.receive, () => now).begin({
		phase: "maintenance.submitted",
		name: "vacuum.tickets",
		reqId: "maintenance.timer",
	});
	now = 1500;
	finish("failure");
	now = 2000;
	diagnostics.snapshot();
	expect(records[0]).toMatchObject({
		activeOperations: 0,
		operations: [],
		completedOperations: [{ name: "vacuum.tickets", at: 0, endedAt: 1500, outcome: "failure" }],
	});
});

test("retains waiting transaction ownership beyond the general detail cap", () => {
	let now = 0;
	const pending = new Map([
		[1, { diagnostic: { name: "system.health", reqId: "reader", enqueuedAt: 0, dispatchedAt: 0 } }],
	]);
	const records: Record<string, unknown>[] = [];
	const diagnostics = createWorkerDiagnostics(
		pending,
		(record) => records.push(record),
		() => now,
	);
	const operations = createOperationDiagnostics(diagnostics.receive, () => now);
	const finish = Array.from({ length: 200 }, (_, index) =>
		operations.begin({ phase: "transaction.wait", name: "tickets.get", reqId: `wait-${index}` }),
	);
	for (const complete of finish.slice(0, 199)) complete("success");
	now = 2000;
	diagnostics.snapshot();
	expect(records[0]).toMatchObject({
		activeOperations: 1,
		omittedOperations: 0,
		operations: [{ reqId: "wait-199", phase: "transaction.wait" }],
	});
});
