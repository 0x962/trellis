import { diagnosticNow, type OperationEvent, type OperationRecord } from "../operationDiagnostics";

export type CallDiagnostic = {
	reqId: string;
	name: string;
	enqueuedAt: number;
	dispatchedAt?: number;
	receivedAt?: number;
	startedAt?: number;
};
export type WorkerDiagnostic = OperationEvent | { type: "receipt" | "execution"; id: number; at: number };

const DETAILS = 128;
const REQUESTS_PER_SNAPSHOT = 8;
const OPERATIONS_PER_SNAPSHOT = 16;
export const WORKER_DELAY_MS = 1000;
const SNAPSHOT_INTERVAL_MS = 5000;

type Pending = { diagnostic?: CallDiagnostic };

export const createWorkerDiagnostics = (
	pending: ReadonlyMap<number, Pending>,
	log: (fields: Record<string, unknown>) => void,
	now = diagnosticNow,
) => {
	const operations = new Map<number, OperationRecord>();
	// Transactions and submitted maintenance retain their identity until settlement.
	const database = new Map<number, OperationRecord>();
	const completed: Array<OperationRecord & { endedAt: number; outcome: "success" | "failure" }> = [];
	let active = 0;
	let lastSnapshot = -Infinity;
	const snapshot = (settled?: CallDiagnostic) => {
		const at = now();
		if (settled !== undefined && at - settled.enqueuedAt < WORKER_DELAY_MS) return;
		if (at - lastSnapshot < SNAPSHOT_INTERVAL_MS) return;
		const calls: CallDiagnostic[] = [];
		let slowRequests = 0;
		for (const value of pending.values()) {
			const call = value.diagnostic;
			if (call === undefined || at - call.enqueuedAt < WORKER_DELAY_MS) continue;
			slowRequests += 1;
			if (calls.length < REQUESTS_PER_SNAPSHOT) calls.push(call);
		}
		if (calls.length === 0) return;
		lastSnapshot = at;
		const selected: OperationRecord[] = [];
		for (const phase of ["transaction", "maintenance.submitted", "transaction.wait", "service"] as const) {
			for (const operation of phase !== "service" ? database.values() : operations.values()) {
				if (operation.phase === phase && selected.length < OPERATIONS_PER_SNAPSHOT) selected.push(operation);
			}
		}
		log({
			at,
			pendingRequests: pending.size,
			slowRequests,
			omittedRequests: Math.max(0, slowRequests - calls.length),
			activeOperations: active,
			omittedOperations: active - selected.length,
			requests: calls.map((call) => ({
				...call,
				elapsedMs: at - call.enqueuedAt,
				hostQueueMs: (call.dispatchedAt ?? at) - call.enqueuedAt,
				dispatchMs: call.dispatchedAt === undefined ? null : (call.receivedAt ?? at) - call.dispatchedAt,
				queueMs: call.receivedAt === undefined ? null : (call.startedAt ?? at) - call.receivedAt,
				executionMs: call.startedAt === undefined ? null : at - call.startedAt,
			})),
			operations: selected.map((operation) => ({ ...operation, elapsedMs: at - operation.at })),
			completedOperations: completed.filter((operation) => at - operation.endedAt < SNAPSHOT_INTERVAL_MS),
		});
	};
	return {
		receive(event: WorkerDiagnostic) {
			if (event.type === "receipt" || event.type === "execution") {
				const call = pending.get(event.id)?.diagnostic;
				if (call !== undefined) {
					if (event.type === "receipt") call.receivedAt = event.at;
					else call.startedAt = event.at;
				}
			} else if (event.type === "begin") {
				active += 1;
				const operation = event.operation;
				if (operation.phase !== "service") database.set(operation.id, operation);
				else if (operations.size < DETAILS) operations.set(operation.id, operation);
			} else if (event.type === "end") {
				active -= 1;
				const operation = database.get(event.id) ?? operations.get(event.id);
				if (operation !== undefined && event.at - operation.at >= WORKER_DELAY_MS) {
					if (completed.length === OPERATIONS_PER_SNAPSHOT) completed.shift();
					completed.push({ ...operation, endedAt: event.at, outcome: event.outcome });
				}
				operations.delete(event.id);
				database.delete(event.id);
			}
		},
		snapshot,
		clear() {
			operations.clear();
			database.clear();
			completed.length = 0;
			active = 0;
			lastSnapshot = -Infinity;
		},
	};
};
