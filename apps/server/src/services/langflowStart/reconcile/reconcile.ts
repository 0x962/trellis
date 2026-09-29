import type { Tx } from "../../../db/tx";
import type { JobsLog } from "../../../jobs";
import type { CorrelationReceiptV1, DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { LangflowStartEngine } from "../engine";
import { reconcileReservation } from "../reconcileReservation";
import type { StartExecution, StartStore } from "../store";

export type ReconcileContext = {
	log: JobsLog;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	now: () => Date;
};
export type ReconcileDependencies = {
	store: StartStore;
	engine: LangflowStartEngine;
	readAuthorityBytes: (authority: DeliveryAuthorityV1) => Promise<string>;
	authorize: (input: { execution: StartExecution; correlation: CorrelationReceiptV1 }) => Promise<DeliveryAuthorityV1>;
};

export function reconcile(ctx: ReconcileContext, input: { executionId: string }, deps: ReconcileDependencies) {
	return reconcileReservation(input, {
		...deps,
		now: ctx.now,
		log: ctx.log,
		repository: {
			read: (value) => ctx.newTx((tx) => deps.store.readSubmission(tx, value)),
			markUnknown: (value) => ctx.newTx((tx) => deps.store.markUnknown(tx, value)),
			bind: (value) => ctx.newTx((tx) => deps.store.bind(tx, value)),
			open: (value) => ctx.newTx((tx) => deps.store.openAdmission(tx, value)),
			confirm: (value) => ctx.newTx((tx) => deps.store.confirmAdmission(tx, value)),
		},
	});
}
