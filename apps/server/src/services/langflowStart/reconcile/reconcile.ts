import { isDeepStrictEqual } from "node:util";
import type { Tx } from "../../../db/tx.ts";
import type { JobsLog } from "../../../jobs.ts";
import {
	AdmissionReceiptV1Schema,
	CorrelationLookupResultV1Schema,
	type CorrelationReceiptV1,
	CorrelationReceiptV1Schema,
	type DeliveryAuthorityV1,
	DeliveryAuthorityV1Schema,
} from "../../../langflowContracts";
import type { LangflowStartEngine } from "../engine.ts";
import type { StartExecution, StartStore } from "../store.ts";
import { submissionEnvelope } from "./components/submissionEnvelope/submissionEnvelope.ts";

export type ReconcileContext = {
	log: JobsLog;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	now: () => Date;
};
export type ReconcileDependencies = {
	store: StartStore;
	engine: LangflowStartEngine;
	authorize: (input: { execution: StartExecution; correlation: CorrelationReceiptV1 }) => Promise<DeliveryAuthorityV1>;
};

export async function reconcile(ctx: ReconcileContext, input: { executionId: string }, deps: ReconcileDependencies) {
	let execution = await ctx.newTx((tx) => deps.store.readSubmission(tx, input));
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
			execution = await ctx.newTx((tx) => deps.store.markUnknown(tx, input));
			ctx.log("langflow.start.unknown", {
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
			Date.parse(authority.expiresAt) <= ctx.now().getTime()
		)
			throw new Error("authority_conflict");
		execution = await ctx.newTx((tx) => deps.store.bind(tx, { ...input, correlation, authority }));
	}
	if (execution.canceled || execution.submission.state === "failed")
		return { execution, disposition: "reused" as const };
	if (execution.admission.state === "closed")
		execution = await ctx.newTx((tx) => deps.store.openAdmission(tx, { ...input, now: ctx.now() }));
	if (execution.canceled || execution.submission.state === "failed")
		return { execution, disposition: "reused" as const };
	if (execution.admission.state !== "open" || execution.authority === null) throw new Error("admission_not_committed");
	const result = await deps.engine.admit({ receipt: execution.admission.receipt, authority: execution.authority });
	if (result.state === "admitted") {
		const receipt = AdmissionReceiptV1Schema.parse(result.receipt);
		if (!isDeepStrictEqual(receipt, execution.admission.receipt)) throw new Error("admission_conflict");
		await ctx.newTx((tx) => deps.store.confirmAdmission(tx, { ...input, receipt }));
	}
	if (result.state === "unknown")
		ctx.log("langflow.start.unknown", {
			operation: "admit",
			executionId: execution.executionId,
			hostId: execution.hostId,
			engineJobId: execution.admission.receipt.engineJobId,
			admissionId: execution.admission.receipt.admissionId,
		});
	return { execution, disposition: result.state === "admitted" ? ("queued" as const) : result.state };
}
