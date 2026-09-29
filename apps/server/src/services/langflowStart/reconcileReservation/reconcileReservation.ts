import { isDeepStrictEqual } from "node:util";
import {
	AdmissionReceiptV1Schema,
	CorrelationLookupResultV1Schema,
	CorrelationReceiptV1Schema,
	DeliveryAuthorityV1Schema,
} from "../../../langflowContracts";
import type { ReconcileDependencies, ReconcileContext } from "../reconcile/reconcile";
import type { StartExecution } from "../store";
import type { StartRepository } from "../startState/contracts";
import { submissionEnvelope } from "../reconcile/components/submissionEnvelope/submissionEnvelope";

export type ReservationDependencies = Omit<ReconcileDependencies, "store"> & {
	repository: StartRepository;
	now: ReconcileContext["now"];
	log: ReconcileContext["log"];
	prepareAdmission?: (execution: StartExecution) => Promise<boolean>;
};

export async function reconcileReservation(input: { executionId: string }, deps: ReservationDependencies) {
	let execution = await deps.repository.read(input);
	if (execution.canceled || execution.submission.state === "failed")
		return { execution, disposition: "reused" as const };
	if (!execution.correlation) {
		const key = { version: 1 as const, hostId: execution.hostId, executionId: execution.executionId };
		const lookup = CorrelationLookupResultV1Schema.parse(await deps.engine.lookup(key));
		if (lookup.state !== "found" && !isDeepStrictEqual(lookup.key, key)) throw new Error("correlation_conflict");
		const result =
			lookup.state === "absent"
				? await deps.engine.submit({
						envelopeBytes: submissionEnvelope(execution),
						payloadBytes: execution.submissionBytes,
						publication: execution.publication,
						snapshot: execution.snapshot,
					})
				: lookup;
		if (result.state === "unknown") {
			if (!isDeepStrictEqual(result.key, key)) throw new Error("correlation_conflict");
			execution = await deps.repository.markUnknown(input);
			deps.log("langflow.start.unknown", {
				operation: lookup.state === "absent" ? "submit" : "lookup",
				executionId: execution.executionId,
				hostId: execution.hostId,
			});
			return { execution, disposition: "unknown" as const };
		}
		const correlation = CorrelationReceiptV1Schema.parse(result.receipt);
		if (
			correlation.hostId !== execution.hostId ||
			correlation.executionId !== execution.executionId ||
			correlation.publicationId !== execution.publicationId ||
			correlation.submissionDigest !== execution.submission.submissionDigest
		)
			throw new Error("correlation_conflict");
		const authority = DeliveryAuthorityV1Schema.parse(await deps.authorize({ execution, correlation }));
		if (
			authority.hostId !== execution.hostId ||
			authority.projectId !== execution.projectId ||
			authority.executionId !== execution.executionId ||
			authority.publicationId !== execution.publicationId ||
			authority.publicationDigest !== execution.publication.documentHash ||
			authority.engineJobId !== correlation.engineJobId ||
			Date.parse(authority.expiresAt) <= deps.now().getTime()
		)
			throw new Error("authority_conflict");
		execution = await deps.repository.bind({ ...input, correlation, authority });
	}
	if (execution.canceled || execution.submission.state === "failed")
		return { execution, disposition: "reused" as const };
	if (deps.prepareAdmission) {
		if (!(await deps.prepareAdmission(execution))) return { execution, disposition: "pending" as const };
		execution = await deps.repository.read(input);
		if (execution.canceled || execution.submission.state === "failed")
			return { execution, disposition: "reused" as const };
	}
	if (execution.admission.state === "closed")
		execution = await deps.repository.open({ ...input, now: deps.now() });
	if (execution.canceled || execution.submission.state === "failed")
		return { execution, disposition: "reused" as const };
	if (execution.admission.state !== "open" || execution.authority === null) throw new Error("admission_not_committed");
	const authorityBytes = await deps.readAuthorityBytes(execution.authority);
	const issuedAuthority = DeliveryAuthorityV1Schema.parse(JSON.parse(authorityBytes));
	if (!isDeepStrictEqual(issuedAuthority, execution.authority)) throw new Error("authority_bytes_conflict");
	const result = await deps.engine.admit({
		receipt: execution.admission.receipt,
		authority: execution.authority,
		authorityBytes,
	});
	if (result.state === "admitted") {
		const receipt = AdmissionReceiptV1Schema.parse(result.receipt);
		if (!isDeepStrictEqual(receipt, execution.admission.receipt)) throw new Error("admission_conflict");
		await deps.repository.confirm({ ...input, receipt });
	}
	if (result.state === "unknown")
		deps.log("langflow.start.unknown", {
			operation: "admit",
			executionId: execution.executionId,
			hostId: execution.hostId,
			engineJobId: execution.admission.receipt.engineJobId,
			admissionId: execution.admission.receipt.admissionId,
		});
	return { execution, disposition: result.state === "admitted" ? ("queued" as const) : result.state };
}
