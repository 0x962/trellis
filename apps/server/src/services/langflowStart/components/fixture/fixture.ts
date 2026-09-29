import { isDeepStrictEqual } from "node:util";
import { executionViewV1Example } from "@trellis/api";
import type { Tx } from "../../../../db/tx.ts";
import type { CorrelationReceiptV1, DeliveryAuthorityV1 } from "../../../../langflowContracts";
import type { LangflowStartEngine } from "../../engine.ts";
import { requestBytes } from "../../requestBytes/requestBytes.ts";
import type { StartExecution, StartIdentity, StartReceipt, StartStore } from "../../store.ts";
import { submission } from "../../submission/submission.ts";

export function fixture() {
	const at = new Date("2026-09-29T06:00:00Z");
	const view = structuredClone(executionViewV1Example);
	const input = { flow: view.flowId, ticket: view.ticketId, expectedVersion: 2, requestId: crypto.randomUUID() };
	const identity = { actorKind: "human" as const, actorName: "test", requestId: input.requestId };
	const submitted = submission({
		executionId: view.id,
		hostId: "host-1",
		actor: { kind: "human", name: "test" },
		requestId: input.requestId,
		requestBytes: requestBytes(input),
		publication: view.publication!,
		snapshot: view.snapshot,
	});
	const initial: StartExecution = {
		engine: "langflow",
		executionId: view.id,
		flowId: view.flowId,
		ticketId: view.ticketId,
		projectId: view.projectId,
		diffId: null,
		reviewedHead: null,
		repeatOf: null,
		repeatReason: null,
		publicationId: view.publication!.publicationId,
		publication: view.publication!,
		snapshot: view.snapshot,
		hostId: "host-1",
		requestBytes: requestBytes(input),
		...submitted,
		correlation: null,
		admission: submitted.submission.admission,
		authority: null,
		createdAt: at,
		canceled: false,
	};
	const records = new Map<string, StartExecution>([[initial.executionId, initial]]);
	const receipts = new Map<string, StartReceipt>();
	const outcomes = new Map<string, { status: typeof view.status; failureKind: typeof view.failureKind }>();
	const keyOf = (key: StartIdentity) => JSON.stringify([key.actorKind, key.actorName, key.requestId]);
	const trace: string[] = [];
	let inTransaction = false;
	let engineReceipt: CorrelationReceiptV1 | null = null;
	const current = () => records.get(initial.executionId)!;
	const store: StartStore = {
		confirmAdmission: async () => {
			trace.push("confirmed");
		},
		readRequest: async (_tx, key) => receipts.get(keyOf(key)) ?? null,
		saveRequest: async (_tx, receipt) => {
			const prior = receipts.get(keyOf(receipt));
			if (prior && prior.requestBytes !== receipt.requestBytes) throw new Error("identity_conflict");
			if (!prior) receipts.set(keyOf(receipt), receipt);
			return prior ?? receipt;
		},
		read: async (_tx, key) => structuredClone(records.get(key.executionId)!),
		readSubmission: async (_tx, key) => structuredClone(records.get(key.executionId)!),
		latest: async (_tx, key) => {
			const execution = [...records.values()]
				.reverse()
				.find((row) => row.flowId === key.flowId && row.diffId === key.diffId);
			return execution
				? {
						execution: structuredClone(execution),
						...(outcomes.get(execution.executionId) ?? { status: "running", failureKind: null }),
					}
				: null;
		},
		reserve: async (_tx, execution) => {
			records.set(execution.executionId, structuredClone(execution));
			return execution;
		},
		markUnknown: async (_tx, key) => {
			const row = records.get(key.executionId)!;
			if (!row.correlation) row.submission.state = "submission_unknown";
			return structuredClone(row);
		},
		bind: async (_tx, value) => {
			const row = records.get(value.executionId)!;
			if (row.canceled) return structuredClone(row);
			if (row.correlation && !isDeepStrictEqual(row.correlation, value.correlation))
				throw new Error("identity_conflict");
			if (!row.correlation) {
				row.correlation = value.correlation;
				row.authority = value.authority;
				row.submission.correlation = value.correlation;
				row.submission.state = "submitted";
			}
			trace.push("bind");
			return structuredClone(row);
		},
		openAdmission: async (_tx, value) => {
			const row = records.get(value.executionId)!;
			if (row.canceled) return structuredClone(row);
			if (row.admission.state === "closed") {
				row.admission = {
					state: "open",
					receipt: {
						version: 1,
						executionId: row.executionId,
						publicationId: row.publicationId,
						engineJobId: row.correlation!.engineJobId,
						engineEpoch: row.authority!.engineEpoch,
						admissionId: "admission-1",
						submissionDigest: row.submission.submissionDigest,
						committedAt: value.now.toISOString(),
					},
				};
				row.submission.admission = row.admission;
			}
			trace.push("open");
			return structuredClone(row);
		},
	};
	const outsideTransaction = () => {
		if (inTransaction) throw new Error("engine_call_in_transaction");
	};
	const engine: LangflowStartEngine = {
		lookup: async (key) => {
			outsideTransaction();
			trace.push("lookup");
			return engineReceipt ? { state: "found", receipt: engineReceipt } : { state: "absent", key, authoritative: true };
		},
		submit: async () => {
			outsideTransaction();
			trace.push("submit");
			engineReceipt = {
				version: 1,
				hostId: "host-1",
				executionId: initial.executionId,
				publicationId: initial.publicationId,
				submissionDigest: initial.submission.submissionDigest,
				engineJobId: "00000000-0000-4000-8000-000000000001",
				engineSessionId: "session-1",
				recordedAt: at.toISOString(),
			};
			return { state: "found", receipt: engineReceipt };
		},
		admit: async ({ receipt }) => {
			outsideTransaction();
			trace.push("admit");
			if (current().admission.state !== "open") throw new Error("admission_not_committed");
			return { state: "admitted", receipt };
		},
	};
	const issuedBytes = new Map<string, string>();
	const authorize = async ({ correlation }: { correlation: CorrelationReceiptV1 }): Promise<DeliveryAuthorityV1> => {
		const authority: DeliveryAuthorityV1 = {
			version: 1,
			executionId: initial.executionId,
			publicationId: initial.publicationId,
			engineJobId: correlation.engineJobId,
			engineEpoch: 1,
			hostId: initial.hostId,
			projectId: initial.projectId,
			publicationDigest: initial.publication.documentHash,
			ownerId: "owner-1",
			ownershipRevision: 1,
			capabilityId: "capability-1",
			permissions: ["native.reserve"],
			issuedAt: at.toISOString(),
			expiresAt: "2026-09-29T07:00:00Z",
		};
		issuedBytes.set(authority.capabilityId, `${JSON.stringify(authority, null, 2)}\n`);
		return authority;
	};
	const readAuthorityBytes = async (authority: DeliveryAuthorityV1) => {
		outsideTransaction();
		const bytes = issuedBytes.get(authority.capabilityId);
		if (bytes === undefined) throw new Error("authority_bytes_missing");
		return bytes;
	};
	const logs: { message: string; fields?: Record<string, unknown> }[] = [];
	const context = {
		log: (message: string, fields?: Record<string, unknown>) => {
			logs.push({ message, fields });
		},
		now: () => at,
		newTx: async <T>(fn: (tx: Tx) => Promise<T>) => {
			inTransaction = true;
			try {
				return await fn({} as Tx);
			} finally {
				inTransaction = false;
				trace.push("commit");
			}
		},
	};
	return {
		logs,
		initial,
		identity,
		input,
		records,
		receipts,
		outcomes,
		current,
		trace,
		store,
		engine,
		authorize,
		readAuthorityBytes,
		context,
	};
}
