import { isDeepStrictEqual } from "node:util";
import type { FlowExecutionDecisionInput, FlowExecutionViewV1 } from "@trellis/api";
import { ulid } from "ulid";
import type { RequestContext } from "../../../context.ts";
import { fail, invalidInput } from "../../../errors.ts";
import {
	type EngineCheckpointV1,
	HumanDecisionReceiptV1Schema,
	type HumanDeliveryV1,
	protocolDigest,
} from "../../../langflowContracts";

export function createReceipt(
	ctx: RequestContext,
	view: FlowExecutionViewV1,
	checkpoint: EngineCheckpointV1,
	input: FlowExecutionDecisionInput,
): { payloadBytes: string; delivery: HumanDeliveryV1 } {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must answer a human flow step.");
	if (view.revision !== input.expectedRevision) throw fail("FLOW_VERSION_CONFLICT", { version: view.revision });
	if (
		view.id !== input.id ||
		checkpoint.executionId !== input.id ||
		view.engine !== "langflow" ||
		checkpoint.publicationId !== view.publication?.publicationId ||
		checkpoint.engineJobId !== view.submission?.engineJobId ||
		checkpoint.engineEpoch !== view.submission?.engineEpoch
	)
		throw new Error("identity_conflict");
	const occurrence = view.occurrences.find((row) => row.actionKey === input.key);
	const waits = checkpoint.waits.filter((row) => row.kind === "human" && row.request.actionKey === input.key);
	const pending = waits[0];
	if (
		!["running", "waiting"].includes(view.status) ||
		occurrence?.state !== "waiting_human" ||
		occurrence.waitReason !== "human" ||
		waits.length !== 1 ||
		pending?.kind !== "human"
	) {
		throw fail("FLOW_VERSION_CONFLICT", { version: view.revision });
	}
	const wait = pending.request;
	const identity = {
		nodeId: occurrence.nodeId,
		occurrenceKey: occurrence.occurrenceKey,
		parentOccurrenceKey: occurrence.parentOccurrenceKey,
		phase: occurrence.phase,
		iterationPath: occurrence.iterationPath,
	};
	if (!isDeepStrictEqual(wait.occurrence, identity)) throw new Error("identity_conflict");
	if (
		view.decisionDeliveries.some(
			(row) => row.engineRequestId === wait.engineRequestId || row.occurrenceKey === occurrence.occurrenceKey,
		)
	) {
		throw fail("FLOW_VERSION_CONFLICT", { version: view.revision });
	}
	const decision = HumanDecisionReceiptV1Schema.parse({
		version: 1,
		decisionId: ulid(),
		wait,
		actor: ctx.actor,
		approved: input.approved,
		output: input.output,
		recordedAt: ctx.now.toISOString(),
	});
	const payloadBytes = JSON.stringify(decision);
	return {
		payloadBytes,
		delivery: {
			version: 1,
			decision,
			payloadDigest: protocolDigest(payloadBytes),
			state: "recorded",
			acceptance: null,
		},
	};
}
