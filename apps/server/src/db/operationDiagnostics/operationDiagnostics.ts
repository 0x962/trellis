export type OperationIdentity = {
	phase: "service" | "transaction.wait" | "transaction" | "maintenance.submitted";
	name: string;
	reqId: string;
};

export type OperationRecord = OperationIdentity & { id: number; at: number };
export type OperationEvent =
	| { type: "begin"; operation: OperationRecord }
	| { type: "end"; id: number; at: number; outcome: "success" | "failure" };

// Epoch milliseconds correlate the HTTP thread and the database worker.
export const diagnosticNow = () => performance.timeOrigin + performance.now();

export const createOperationDiagnostics = (send: (event: OperationEvent) => void, now = diagnosticNow) => {
	let nextId = 1;
	return {
		begin(identity: OperationIdentity) {
			const id = nextId++;
			send({ type: "begin", operation: { ...identity, id, at: now() } });
			return (outcome: "success" | "failure") => send({ type: "end", id, at: now(), outcome });
		},
	};
};

export type OperationDiagnostics = ReturnType<typeof createOperationDiagnostics>;
