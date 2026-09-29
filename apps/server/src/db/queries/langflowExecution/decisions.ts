import { isDeepStrictEqual } from "node:util";
import { and, eq, or } from "drizzle-orm";
import {
	type DecisionAcceptanceV1,
	HumanDecisionReceiptV1Schema,
	type HumanDeliveryV1,
	protocolDigest,
	readProtocolBytes,
} from "../../../langflowContracts";
import { langflowDecisions as decisions, langflowOutbox } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
export async function recordDecision(tx: Tx, input: { payloadBytes: string }) {
	const decision = readProtocolBytes(HumanDecisionReceiptV1Schema, input.payloadBytes);
	const execution = await lockExecution(tx, decision.wait);
	const [existing] = await tx
		.select()
		.from(decisions)
		.where(
			or(
				eq(decisions.decisionId, decision.decisionId),
				and(
					eq(decisions.engineJobId, decision.wait.engineJobId),
					eq(decisions.engineRequestId, decision.wait.engineRequestId),
				),
			),
		);
	if (existing) {
		if (existing.payloadBytes !== input.payloadBytes) throw new Error("identity_conflict");
		return existing.delivery;
	}
	if (
		execution.cancelIntent ||
		execution.engineJobId !== decision.wait.engineJobId ||
		execution.publicationId !== decision.wait.publicationId
	)
		throw new Error("decision_conflict");
	const delivery: HumanDeliveryV1 = {
		version: 1,
		decision,
		payloadDigest: protocolDigest(input.payloadBytes),
		state: "recorded",
		acceptance: null,
	};
	await tx.insert(decisions).values({
		decisionId: decision.decisionId,
		executionId: execution.executionId,
		engineJobId: decision.wait.engineJobId,
		engineRequestId: decision.wait.engineRequestId,
		payloadBytes: input.payloadBytes,
		delivery,
	});
	await tx.insert(langflowOutbox).values({
		id: decision.decisionId,
		executionId: execution.executionId,
		kind: "decision",
		payloadBytes: input.payloadBytes,
	});
	return delivery;
}
export async function updateDecisionDelivery(
	tx: Tx,
	input:
		| { executionId: string; decisionId: string; state: "pending" | "unknown" }
		| { executionId: string; decisionId: string; state: "confirmed"; acceptance: DecisionAcceptanceV1 },
) {
	await lockExecution(tx, input);
	const [row] = await tx
		.select()
		.from(decisions)
		.where(and(eq(decisions.executionId, input.executionId), eq(decisions.decisionId, input.decisionId)));
	const saved = row!.delivery;
	if (saved.state === "confirmed") {
		if (input.state === "confirmed" && !isDeepStrictEqual(saved.acceptance, input.acceptance))
			throw new Error("decision_acceptance_conflict");
		return saved;
	}
	let delivery: HumanDeliveryV1;
	if (input.state === "confirmed") {
		const receipt = input.acceptance;
		if (
			receipt.decisionId !== saved.decision.decisionId ||
			receipt.payloadDigest !== saved.payloadDigest ||
			receipt.executionId !== input.executionId ||
			receipt.engineJobId !== saved.decision.wait.engineJobId ||
			receipt.engineRequestId !== saved.decision.wait.engineRequestId
		)
			throw new Error("decision_acceptance_conflict");
		delivery = { ...saved, state: "confirmed", acceptance: receipt };
		await tx
			.update(langflowOutbox)
			.set({ receipt })
			.where(and(eq(langflowOutbox.kind, "decision"), eq(langflowOutbox.id, input.decisionId)));
	} else delivery = { ...saved, state: input.state, acceptance: null };
	await tx.update(decisions).set({ delivery }).where(eq(decisions.decisionId, input.decisionId));
	return delivery;
}

export async function readDecision(tx: Tx, input: { executionId: string; decisionId: string }) {
	const [row] = await tx
		.select()
		.from(decisions)
		.where(and(eq(decisions.executionId, input.executionId), eq(decisions.decisionId, input.decisionId)));
	return row ?? null;
}
