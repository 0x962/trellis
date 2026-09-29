import { and, asc, eq, gt, or } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { assertAuthority, lockExecution, readDecision } from "../../../db/queries/langflowExecution";
import { langflowOutbox } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import type { DeliveryAuthorityV1, HumanDeliveryV1 } from "../../../langflowContracts";
import type { PreparedDecision } from "../deliver";
import { prepareDelivery } from "../prepareDelivery";
import { recordAcknowledgement } from "../recordAcknowledgement";

type Key = { executionId: string; decisionId: string };
type AuthorizedKey = Key & { authority: DeliveryAuthorityV1 };
export type DecisionStateOperations = {
	page(input: { executionId?: string; after: Key | null }): Promise<Key[]>;
	read(input: Key): Promise<{
		stored: NonNullable<Awaited<ReturnType<typeof readDecision>>>;
		authority: DeliveryAuthorityV1 | null;
		canceled: boolean;
	}>;
	prepare(input: AuthorizedKey): Promise<PreparedDecision | null>;
	authorize(input: AuthorizedKey): Promise<void>;
	acknowledge(input: Key & { delivery: HumanDeliveryV1 }): Promise<HumanDeliveryV1>;
};
export type DecisionStateInput = {
	[K in keyof DecisionStateOperations]: { operation: K; input: Parameters<DecisionStateOperations[K]>[0] };
}[keyof DecisionStateOperations];

export async function decisionState(ctx: ServiceCtx, tx: Tx, request: DecisionStateInput) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	if (request.operation === "page") {
		const { executionId, after } = request.input;
		return tx
			.select({ executionId: langflowOutbox.executionId, decisionId: langflowOutbox.id })
			.from(langflowOutbox)
			.where(
				and(
					eq(langflowOutbox.kind, "decision"),
					executionId === undefined ? undefined : eq(langflowOutbox.executionId, executionId),
					after === null
						? undefined
						: or(
								gt(langflowOutbox.executionId, after.executionId),
								and(eq(langflowOutbox.executionId, after.executionId), gt(langflowOutbox.id, after.decisionId)),
							),
				),
			)
			.orderBy(asc(langflowOutbox.executionId), asc(langflowOutbox.id))
			.limit(100);
	}
	if (request.operation === "prepare") return prepareDelivery(ctx, tx, request.input);
	if (request.operation === "authorize") {
		const execution = await lockExecution(tx, request.input);
		if (execution.cancelIntent) throw new Error("execution_canceled");
		await assertAuthority(tx, execution, request.input.authority, "decision.deliver", ctx.now);
		return;
	}
	if (request.operation === "acknowledge") {
		await recordAcknowledgement(ctx, tx, request.input);
		return (await readDecision(tx, request.input))!.delivery;
	}
	const execution = await lockExecution(tx, request.input);
	const stored = await readDecision(tx, request.input);
	if (!stored) throw new Error("decision_obligation_missing");
	return { stored, authority: execution.authority, canceled: execution.cancelIntent !== null };
}
